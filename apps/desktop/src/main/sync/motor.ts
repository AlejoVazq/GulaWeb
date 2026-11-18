import { io } from 'socket.io-client';
import type { RespuestaPullCarta } from '../../compartido/tipos';
import type { BaseLocal } from '../db/base';
import { aplicarCambiosCarta } from '../db/carta';
import { escribirKv, leerKv } from '../db/kv';
import { contarPendientes, marcarAplicadas, marcarRechazada, pendientes, registrarFallo } from '../db/outbox';
import { SinConexion } from '../api/cliente';

export type EstadoSync = {
  conexion: 'en-linea' | 'sin-conexion' | 'sincronizando';
  pendientes: number;
  ultimaSync: string | null;
};

type ClienteSync = {
  pedir<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: object): Promise<T>;
  tokenActual(): string | null;
  url(ruta: string): string;
};

export type SocketMinimo = { on(evento: string, fn: (...a: unknown[]) => void): void; close(): void };
export type CrearSocket = (url: string, path: string, token: string) => SocketMinimo;

type Resultado = { id: string; estado: 'aplicada' | 'rechazada'; error?: { codigo: string; mensaje: string } };

const CLAVE_CURSOR = 'cursor:carta';
const PERIODO_MS = 60_000;
const BACKOFF_MAX_MS = 60_000;

/** Socket.IO real: la ruta se deriva de la URL base (p. ej. https://dominio/api → /api/tiempo-real). */
export const socketIo: CrearSocket = (url, path, token) =>
  io(url, { path, auth: { token }, transports: ['websocket'], reconnectionDelayMax: 30_000 });

export function crearMotor(opts: {
  base: BaseLocal;
  cliente: ClienteSync;
  crearSocket?: CrearSocket;
  alCambiarCarta?: () => void;
}) {
  const { base, cliente } = opts;
  const crearSocket = opts.crearSocket ?? socketIo;
  const oyentes = new Set<(e: EstadoSync) => void>();
  let estado: EstadoSync = { conexion: 'sincronizando', pendientes: contarPendientes(base), ultimaSync: null };
  let enCurso: Promise<void> | null = null;
  let repetir = false;
  let backoff = 1000;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let periodico: ReturnType<typeof setInterval> | null = null;
  let socket: SocketMinimo | null = null;
  let activo = false;

  const emitir = (cambios: Partial<EstadoSync>) => {
    estado = { ...estado, ...cambios, pendientes: contarPendientes(base) };
    oyentes.forEach((fn) => fn(estado));
  };

  async function push(): Promise<void> {
    for (;;) {
      const lote = pendientes(base, 100);
      if (!lote.length) return;
      try {
        const { resultados } = await cliente.pedir<{ resultados: Resultado[] }>('POST', '/sync/operaciones', {
          operaciones: lote.map((o) => ({ id: o.id, tipo: o.tipo, datos: o.datos, creadaEn: o.creadaEn })),
        });
        marcarAplicadas(base, resultados.filter((r) => r.estado === 'aplicada').map((r) => r.id));
        for (const r of resultados.filter((x) => x.estado === 'rechazada')) {
          marcarRechazada(base, r.id, r.error?.codigo ?? 'RECHAZADA');
        }
      } catch (e) {
        registrarFallo(base, lote.map((o) => o.id), e instanceof Error ? e.message : String(e));
        throw e;
      }
    }
  }

  async function pull(): Promise<void> {
    const cursor = leerKv(base, CLAVE_CURSOR);
    const ruta = cursor ? `/sync/carta?desde=${encodeURIComponent(cursor)}` : '/sync/carta';
    const cambios = await cliente.pedir<RespuestaPullCarta>('GET', ruta);
    aplicarCambiosCarta(base, cambios);
    escribirKv(base, CLAVE_CURSOR, cambios.cursor);
    opts.alCambiarCarta?.();
  }

  function programarReintento() {
    if (!activo || temporizador) return;
    temporizador = setTimeout(() => {
      temporizador = null;
      void sincronizarAhora();
    }, backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
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
          emitir({ conexion: 'en-linea', ultimaSync: new Date().toISOString() });
        } catch (e) {
          // Sin red: 'sin-conexion'. Error de la API (servidor respondió): sigue en línea y se reintenta.
          emitir({ conexion: e instanceof SinConexion ? 'sin-conexion' : 'en-linea' });
          programarReintento();
          repetir = false;
        }
      } while (repetir);
    })().finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  function conectarSocket() {
    const token = cliente.tokenActual();
    if (!token) return;
    const raiz = new URL(cliente.url(''));
    const path = `${raiz.pathname.replace(/\/$/, '')}/tiempo-real`;
    socket = crearSocket(raiz.origin, path, token);
    socket.on('cambios', () => void sincronizarAhora());
    socket.on('connect', () => void sincronizarAhora());
    socket.on('disconnect', () => emitir({ conexion: 'sin-conexion' }));
  }

  return {
    iniciar() {
      if (activo) return;
      activo = true;
      void sincronizarAhora().then(conectarSocket);
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
      socket?.close();
      socket = null;
      if (activo) conectarSocket();
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
