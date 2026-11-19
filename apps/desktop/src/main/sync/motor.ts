import { io } from 'socket.io-client';
import type { RespuestaPullCarta } from '../../compartido/tipos';
import type { RespuestaPullSalon } from '../../compartido/salon';
import { aplicarCambiosSalon, revertirOperacionLocal } from '../db/salon';
import { aplicarCambiosCaja, revertirOperacionCaja } from '../db/caja';
import type { RespuestaPullCaja } from '../../compartido/caja';
import type { BaseLocal } from '../db/base';
import { aplicarCambiosCarta } from '../db/carta';
import { borrarKv, escribirKv, leerKv } from '../db/kv';
import {
  contarPendientes,
  contarRechazadas,
  marcarAplicadas,
  marcarRechazada,
  pendientes,
  registrarFallo,
} from '../db/outbox';
import { ErrorApiCliente, SinConexion } from '../api/cliente';

export type EstadoSync = {
  conexion: 'en-linea' | 'sin-conexion' | 'sincronizando';
  pendientes: number;
  rechazadas: number;
  ultimaSync: string | null;
  /** Hora del servidor menos hora de la PC (ms), medida en la última sincronización. */
  desfaseReloj: number | null;
};

type ClienteSync = {
  pedir<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: object): Promise<T>;
  tokenActual(): string | null;
  refrescar(): Promise<boolean>;
  url(ruta: string): string;
  /** Cabecera `Date` de la última respuesta. */
  fechaServidor?(): string | null;
};

export type SocketMinimo = {
  on(evento: string, fn: (...a: unknown[]) => void): void;
  close(): void;
  connect(): void;
};
/** El token se pide en cada (re)conexión: nunca se reconecta con uno vencido. */
export type CrearSocket = (url: string, path: string, obtenerToken: () => string | null) => SocketMinimo;

type Resultado = { id: string; estado: 'aplicada' | 'rechazada'; error?: { codigo: string; mensaje: string } };

const CLAVE_CURSOR = 'cursor:carta';
const CLAVE_CURSOR_SALON = 'cursor:salon';
const CLAVE_CURSOR_CAJA = 'cursor:caja';
const PERIODO_MS = 60_000;
const BACKOFF_MAX_MS = 60_000;
const LOTE_MAX = 100;
/** Fallos seguidos del servidor con el mismo tamaño de lote antes de partirlo (o, con 1, rechazarla). */
const FALLOS_PARA_PARTIR = 3;

/** ¿El servidor respondió con un error (no es falta de red ni de sesión)? Puede ser culpa de una operación. */
const esFalloDelServidor = (e: unknown) =>
  e instanceof ErrorApiCliente && e.status !== 401 && e.status !== 502 && e.status !== 503 && e.status !== 504;

export const socketIo: CrearSocket = (url, path, obtenerToken) =>
  io(url, {
    path,
    auth: (cb) => cb({ token: obtenerToken() }),
    transports: ['websocket'],
    reconnectionDelayMax: 30_000,
  });

const hayFilas = (c: RespuestaPullCarta) =>
  c.sectores.length + c.categorias.length + c.productos.length + c.grupos.length + c.opciones.length > 0;
const hayFilasSalon = (c: RespuestaPullSalon) =>
  c.mesas.length + c.sesiones.length + c.pedidos.length + c.items.length + c.avisos.length > 0;

export function crearMotor(opts: {
  base: BaseLocal;
  cliente: ClienteSync;
  crearSocket?: CrearSocket;
  alCambiarCarta?: () => void;
  alCambiarSalon?: () => void;
  alCambiarCaja?: () => void;
}) {
  const { base, cliente } = opts;
  const crearSocket = opts.crearSocket ?? socketIo;
  const oyentes = new Set<(e: EstadoSync) => void>();
  const contar = () => ({ pendientes: contarPendientes(base), rechazadas: contarRechazadas(base) });
  let estado: EstadoSync = { conexion: 'sincronizando', ultimaSync: null, desfaseReloj: null, ...contar() };
  const medirDesfase = () => {
    const t = Date.parse(cliente.fechaServidor?.() ?? '');
    return Number.isNaN(t) ? estado.desfaseReloj : t - Date.now();
  };
  let enCurso: Promise<void> | null = null;
  let repetir = false;
  let backoff = 1000;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let periodico: ReturnType<typeof setInterval> | null = null;
  let socket: SocketMinimo | null = null;
  let activo = false;
  /** Tamaño de lote actual: se parte a la mitad cuando el servidor falla seguido, y vuelve a crecer al andar. */
  let tamLote = LOTE_MAX;
  let fallosSeguidos = 0;

  const emitir = (cambios: Partial<EstadoSync>) => {
    estado = { ...estado, ...cambios, ...contar() };
    oyentes.forEach((fn) => fn(estado));
  };

  function rechazarLocal(o: { id: string; tipo: string; datos: unknown }, codigo: string) {
    marcarRechazada(base, o.id, codigo);
    revertirOperacionLocal(base, o.tipo, o.datos);
    revertirOperacionCaja(base, o.tipo, o.datos);
  }
  /** Un rechazo deja un cambio optimista local que el servidor nunca hizo: pull completo para revertirlo. */
  function pedirPullCompleto() {
    borrarKv(base, CLAVE_CURSOR);
    borrarKv(base, CLAVE_CURSOR_SALON);
    borrarKv(base, CLAVE_CURSOR_CAJA);
  }

  async function push(): Promise<void> {
    for (;;) {
      const lote = pendientes(base, tamLote);
      if (!lote.length) return;
      let resultados: Resultado[];
      try {
        ({ resultados } = await cliente.pedir<{ resultados: Resultado[] }>('POST', '/sync/operaciones', {
          operaciones: lote.map((o) => ({
            id: o.id,
            tipo: o.tipo,
            datos: o.datos,
            creadaEn: o.creadaEn,
            usuarioId: o.usuarioId ?? undefined,
            autorizacion: o.autorizacion ?? undefined,
          })),
        }));
      } catch (e) {
        registrarFallo(base, lote.map((o) => o.id), e instanceof Error ? e.message : String(e));
        if (esFalloDelServidor(e) && ++fallosSeguidos >= FALLOS_PARA_PARTIR) {
          fallosSeguidos = 0;
          if (lote.length > 1) {
            tamLote = Math.ceil(lote.length / 2);
          } else {
            // Antes de culpar a la operación: si el servidor tampoco responde un pull, el problema es suyo.
            await pull().catch(() => {
              throw e;
            });
            // Una sola operación con la que el servidor falla siempre: se aparta para que la cola siga.
            rechazarLocal(lote[0]!, 'ERROR_SERVIDOR');
            pedirPullCompleto();
            continue;
          }
        }
        throw e;
      }
      fallosSeguidos = 0;
      tamLote = Math.min(LOTE_MAX, tamLote * 2);
      marcarAplicadas(base, resultados.filter((r) => r.estado === 'aplicada').map((r) => r.id));
      const rechazadas = resultados.filter((x) => x.estado === 'rechazada');
      for (const r of rechazadas) {
        const o = lote.find((x) => x.id === r.id);
        if (o) rechazarLocal(o, r.error?.codigo ?? 'RECHAZADA');
        else marcarRechazada(base, r.id, r.error?.codigo ?? 'RECHAZADA');
      }
      if (rechazadas.length) pedirPullCompleto();
      if (resultados.length < lote.length) return; // respuesta parcial: lo que falta se reintenta después
    }
  }

  async function pull(): Promise<void> {
    const cursor = leerKv(base, CLAVE_CURSOR);
    const ruta = cursor ? `/sync/carta?desde=${encodeURIComponent(cursor)}` : '/sync/carta';
    const cambios = await cliente.pedir<RespuestaPullCarta>('GET', ruta);
    aplicarCambiosCarta(base, cambios);
    escribirKv(base, CLAVE_CURSOR, cambios.cursor);
    if (hayFilas(cambios)) opts.alCambiarCarta?.();

    const cursorSalon = leerKv(base, CLAVE_CURSOR_SALON);
    const salon = await cliente.pedir<RespuestaPullSalon>(
      'GET',
      cursorSalon ? `/sync/salon?desde=${encodeURIComponent(cursorSalon)}` : '/sync/salon',
    );
    // Si hubo que saltear filas con cambios en vuelo, el próximo pull las vuelve a pedir.
    if (aplicarCambiosSalon(base, salon) === 0) escribirKv(base, CLAVE_CURSOR_SALON, salon.cursor);
    if (hayFilasSalon(salon)) opts.alCambiarSalon?.();

    const cursorCaja = leerKv(base, CLAVE_CURSOR_CAJA);
    const caja = await cliente.pedir<RespuestaPullCaja>(
      'GET',
      cursorCaja ? `/sync/caja?desde=${encodeURIComponent(cursorCaja)}` : '/sync/caja',
    );
    if (aplicarCambiosCaja(base, caja) === 0) escribirKv(base, CLAVE_CURSOR_CAJA, caja.cursor);
    if (caja.turnos.length + caja.cobros.length + caja.pagos.length + caja.movimientos.length) opts.alCambiarCaja?.();
  }

  function programarReintento() {
    if (!activo || temporizador) return;
    temporizador = setTimeout(() => {
      temporizador = null;
      void sincronizarAhora();
    }, backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  function conectarSocket() {
    if (!activo) return;
    socket?.close();
    socket = null;
    if (!cliente.tokenActual()) return;
    const raiz = new URL(cliente.url(''));
    const path = `${raiz.pathname.replace(/\/$/, '')}/tiempo-real`;
    const s = crearSocket(raiz.origin, path, () => cliente.tokenActual());
    socket = s;
    s.on('cambios', () => void sincronizarAhora());
    s.on('connect', () => void sincronizarAhora());
    s.on('disconnect', () => emitir({ conexion: 'sin-conexion' }));
    // El servidor rechazó el handshake (token vencido): renovar y reintentar con el token nuevo.
    s.on('connect_error', () => {
      void cliente.refrescar().then((ok) => {
        if (ok && activo && socket === s) s.connect();
      });
    });
  }

  /** Push y después pull (el push primero evita que un pull revierta un cambio optimista). */
  function sincronizarAhora(): Promise<void> {
    if (enCurso) {
      repetir = true;
      return enCurso;
    }
    enCurso = (async () => {
      do {
        repetir = false;
        try {
          emitir({ conexion: 'sincronizando' });
          await push();
          await pull();
          backoff = 1000;
          emitir({ conexion: 'en-linea', ultimaSync: new Date().toISOString(), desfaseReloj: medirDesfase() });
          if (activo && !socket) conectarSocket();
        } catch (e) {
          // Sin red: 'sin-conexion'. Error de la API (servidor respondió): sigue en línea y se reintenta.
          emitir({ conexion: e instanceof SinConexion ? 'sin-conexion' : 'en-linea' });
          programarReintento();
          // Si alguien pidió sincronizar durante este intento (por ejemplo, porque volvió la red), se reintenta ya.
        }
      } while (repetir);
    })().finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  return {
    iniciar() {
      if (activo) return;
      activo = true;
      conectarSocket();
      void sincronizarAhora();
      periodico = setInterval(() => void sincronizarAhora(), PERIODO_MS);
    },
    detener() {
      activo = false;
      if (temporizador) clearTimeout(temporizador);
      if (periodico) clearInterval(periodico);
      temporizador = periodico = null;
      socket?.close();
      socket = null;
    },
    /** Reconecta el socket con el token nuevo (tras login o cambio de usuario). */
    reconectar() {
      conectarSocket();
    },
    sincronizarAhora,
    estado: () => estado,
    on(_e: 'estado', fn: (e: EstadoSync) => void) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
  };
}

export type Motor = ReturnType<typeof crearMotor>;
