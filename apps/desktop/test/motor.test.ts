import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { contarPendientes, encolar, leerRechazadas, pendientes } from '../src/main/db/outbox';
import { escribirKv, leerKv } from '../src/main/db/kv';
import { crearMotor, type EstadoSync } from '../src/main/sync/motor';
import { ErrorApiCliente, SinConexion } from '../src/main/api/cliente';
import { carpetaTemporal } from './tmp';
import { abrirMesaLocal, crearPedidoLocal } from '../src/main/db/salon';
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
beforeEach(() => {
  base = abrirBase(tmp.ruta(`m${n++}.db`));
});

type Respuesta = (ruta: string, cuerpo?: unknown) => unknown;
const salonVacio = { cursor: '2026-11-18T10:00:00.000Z', mesas: [], sesiones: [], pedidos: [], items: [], avisos: [] };
/** `salon` responde /sync/salon; si no se indica, el salón viene vacío (va después del pull de carta). */
const cajaVacia = { cursor: '2026-11-18T10:00:00.000Z', turnos: [], cobros: [], pagos: [], movimientos: [] };
function clienteFalso(responder: Respuesta, salon?: Respuesta, caja?: Respuesta) {
  return {
    pedir: async <T>(_m: string, ruta: string, cuerpo?: unknown) => {
      if (ruta.startsWith('/sync/caja')) return (caja ? caja(ruta, cuerpo) : cajaVacia) as T;
      if (ruta.startsWith('/sync/salon')) {
        return (salon ? salon(ruta, cuerpo) : salonVacio) as T;
      }
      return responder(ruta, cuerpo) as T;
    },
    tokenActual: () => 'token' as string | null,
    refrescar: async () => true,
    url: (r: string) => `http://api${r}`,
  };
}
const sinSocket = () => ({ on: () => {}, close: () => {}, connect: () => {} });

it('sin conexión: estado sin-conexion y la operación sigue pendiente', async () => {
  encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const motor = crearMotor({ base, cliente: clienteFalso(() => { throw new SinConexion(); }), crearSocket: sinSocket });
  await motor.sincronizarAhora();
  expect(motor.estado()).toMatchObject({ conexion: 'sin-conexion', pendientes: 1 });
  expect(pendientes(base)[0]!.intentos).toBe(1);
});

it('al volver la conexión envía y queda en línea', async () => {
  const op = encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  let red = false;
  const estados: EstadoSync[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      if (!red) throw new SinConexion();
      if (ruta === '/sync/operaciones') return { resultados: [{ id: op.id, estado: 'aplicada' }] };
      return pullDePrueba();
    }),
  });
  motor.on('estado', (e) => estados.push(e));
  await motor.sincronizarAhora();
  red = true;
  await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(motor.estado()).toMatchObject({ conexion: 'en-linea', pendientes: 0 });
  expect(motor.estado().ultimaSync).not.toBeNull();
  expect(estados.map((e) => e.conexion)).toContain('sin-conexion');
});

it('una operación rechazada no se reintenta', async () => {
  const op = encolar(base, { tipo: 'x', datos: {} });
  let envios = 0;
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      if (ruta === '/sync/operaciones') {
        envios++;
        return { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS', mensaje: 'x' } }] };
      }
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(envios).toBe(1);
  expect(contarPendientes(base)).toBe(0);
});

it('el pull guarda el cursor y lo usa en el siguiente', async () => {
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      rutas.push(ruta);
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(rutas).toEqual(['/sync/carta', `/sync/carta?desde=${encodeURIComponent(pullDePrueba().cursor)}`]);
});

type Manejadores = Record<string, (...a: unknown[]) => void>;
function socketsFalsos() {
  const creados: { auth: () => string | null; manejadores: Manejadores; cerrado: boolean; conectar: number }[] = [];
  const crear = (_url: string, _path: string, auth: () => string | null) => {
    const s = { auth, manejadores: {} as Manejadores, cerrado: false, conectar: 0 };
    creados.push(s);
    return {
      on: (ev: string, fn: (...a: unknown[]) => void) => {
        s.manejadores[ev] = fn;
      },
      close: () => {
        s.cerrado = true;
      },
      connect: () => {
        s.conectar++;
      },
    };
  };
  return { creados, crear, abiertos: () => creados.filter((s) => !s.cerrado).length };
}

it('iniciar y reconectar no dejan dos sockets abiertos', async () => {
  const sk = socketsFalsos();
  const motor = crearMotor({ base, crearSocket: sk.crear, cliente: { ...clienteFalso(() => pullDePrueba()), refrescar: async () => true } });
  motor.iniciar();
  motor.reconectar();
  await motor.sincronizarAhora();
  await new Promise((r) => setTimeout(r, 10));
  expect(sk.abiertos()).toBe(1);
  motor.detener();
  expect(sk.abiertos()).toBe(0);
});

it('el socket pide el token actual y ante connect_error refresca y reconecta', async () => {
  const sk = socketsFalsos();
  let token = 'viejo';
  const refrescar = async () => {
    token = 'nuevo';
    return true;
  };
  const cliente = { ...clienteFalso(() => pullDePrueba()), tokenActual: () => token, refrescar };
  const motor = crearMotor({ base, crearSocket: sk.crear, cliente });
  motor.iniciar();
  await motor.sincronizarAhora();
  await new Promise((r) => setTimeout(r, 10));
  const s = sk.creados.at(-1)!;
  expect(s.auth()).toBe('viejo');
  s.manejadores['connect_error']!(new Error('SESION_INVALIDA'));
  await new Promise((r) => setTimeout(r, 10));
  expect(s.auth()).toBe('nuevo');
  expect(s.conectar).toBe(1);
  motor.detener();
});

it('si arrancó sin token, crea el socket después de la primera sincronización exitosa', async () => {
  const sk = socketsFalsos();
  let token: string | null = null;
  const motor = crearMotor({ base, crearSocket: sk.crear, cliente: { ...clienteFalso(() => pullDePrueba()), tokenActual: () => token, refrescar: async () => true } });
  motor.iniciar();
  await new Promise((r) => setTimeout(r, 10));
  expect(sk.creados).toHaveLength(0);
  token = 'ya';
  await motor.sincronizarAhora();
  expect(sk.creados).toHaveLength(1);
  motor.detener();
});

it('un pull sin cambios no avisa carta:cambio', async () => {
  const avisos: number[] = [];
  const vacio = { ...pullDePrueba(), sectores: [], categorias: [], productos: [], grupos: [], opciones: [] };
  let primera = true;
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    alCambiarCarta: () => avisos.push(1),
    cliente: clienteFalso(() => {
      const r = primera ? pullDePrueba() : vacio;
      primera = false;
      return r;
    }),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(avisos).toHaveLength(1);
});

it('una operación rechazada fuerza un pull completo (revierte lo optimista) y se cuenta', async () => {
  escribirKv(base, 'cursor:carta', '2026-11-18T09:00:00.000Z');
  const op = encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      rutas.push(ruta);
      if (ruta === '/sync/operaciones') {
        return { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'NO_ENCONTRADO', mensaje: 'x' } }] };
      }
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  expect(rutas.filter((r) => r.startsWith('/sync/carta'))).toEqual(['/sync/carta']);
  expect(motor.estado().rechazadas).toBe(1);
});

const sesionLocal = (id: string) => ({
  id, mesaId: 'm1', estado: 'abierta', comensales: null, abiertaPor: null, abiertaEn: '2026-11-18T10:00:00.000Z',
  cerradaPor: null, cerradaEn: null, actualizadoEn: '2026-11-18T10:00:00.000Z', eliminadoEn: null,
});

it('trae el salón con su propio cursor y avisa salon:cambio solo si hubo filas', async () => {
  const rutas: string[] = [];
  const avisos: number[] = [];
  let primera = true;
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    alCambiarSalon: () => avisos.push(1),
    cliente: clienteFalso(
      () => pullDePrueba(),
      (ruta) => {
        rutas.push(ruta);
        const r = primera ? { ...salonVacio, cursor: 'C1', sesiones: [sesionLocal('s1')] } : { ...salonVacio, cursor: 'C2' };
        primera = false;
        return r;
      },
    ),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(rutas).toEqual(['/sync/salon', '/sync/salon?desde=C1']);
  expect(avisos).toHaveLength(1);
});

it('si el servidor rechaza mesa.abrir, la sesión optimista desaparece', async () => {
  abrirMesaLocal(base, { sesionId: 's9', mesaId: 'm1', comensales: null, usuarioId: 'u1', ahora: new Date() });
  const op = encolar(base, { tipo: 'mesa.abrir', datos: { sesionId: 's9', mesaId: 'm1' } });
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) =>
      ruta === '/sync/operaciones'
        ? { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'MESA_OCUPADA', mensaje: 'x' } }] }
        : pullDePrueba(),
    ),
  });
  await motor.sincronizarAhora();
  expect(base.db.prepare("SELECT count(*) AS n FROM sesiones WHERE id = 's9'").get()).toEqual({ n: 0 });
});

it('si el servidor rechaza pedido.crear, el pedido optimista desaparece y se pide el salón completo', async () => {
  escribirKv(base, 'cursor:salon', 'C1');
  crearPedidoLocal(base, {
    pedidoId: 'p9', origen: 'mostrador', sesionId: null, numero: 1, dia: '2026-11-18', notas: null, usuarioId: 'u1',
    ahora: new Date(),
    items: [{ itemId: 'i9', productoId: 'p1', nombre: 'Muzza', precioUnitario: 1, cantidad: 1, seleccion: {}, resumenOpciones: '', nota: '', sectorId: null }],
  });
  const op = encolar(base, { tipo: 'pedido.crear', datos: { pedidoId: 'p9' } });
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso(
      (ruta) =>
        ruta === '/sync/operaciones'
          ? { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS', mensaje: 'x' } }] }
          : pullDePrueba(),
      (ruta) => {
        rutas.push(ruta);
        return salonVacio;
      },
    ),
  });
  await motor.sincronizarAhora();
  expect(base.db.prepare("SELECT count(*) AS n FROM pedidos WHERE id = 'p9'").get()).toEqual({ n: 0 });
  expect(base.db.prepare("SELECT count(*) AS n FROM items WHERE pedido_id = 'p9'").get()).toEqual({ n: 0 });
  expect(rutas).toEqual(['/sync/salon']);
});

it('si el pull tuvo que saltear filas con cambios en vuelo, no avanza el cursor', async () => {
  escribirKv(base, 'cursor:salon', 'C0');
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso(
      (ruta) => (ruta === '/sync/operaciones' ? { resultados: [] } : pullDePrueba()),
      () => {
        // La moza toca algo justo mientras el pull viaja.
        encolar(base, { tipo: 'mesa.cerrar', datos: { sesionId: 's1' } });
        return { ...salonVacio, cursor: 'C1', sesiones: [sesionLocal('s1')] };
      },
    ),
  });
  await motor.sincronizarAhora();
  expect(leerKv(base, 'cursor:salon')).toBe('C0');
});

it('una operación con autorización viaja con ella y al aplicarse no queda guardada', async () => {
  const op = encolar(base, { tipo: 'item.anular', datos: { itemId: 'i', pedidoId: 'p', motivo: 'x' }, autorizacion: { usuarioId: 'enc', pin: '5555' } });
  let enviado: unknown;
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta, cuerpo) => {
      if (ruta === '/sync/operaciones') {
        enviado = cuerpo;
        return { resultados: [{ id: op.id, estado: 'aplicada' }] };
      }
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  expect((enviado as { operaciones: { autorizacion: unknown }[] }).operaciones[0]!.autorizacion).toEqual({ usuarioId: 'enc', pin: '5555' });
  expect(base.db.prepare('SELECT count(*) AS n FROM outbox').get()).toEqual({ n: 0 });
});

it('trae la caja con su cursor y avisa caja:cambio si hubo filas', async () => {
  let cambios = 0;
  const T = '2026-11-18T10:00:00.000Z';
  const turno = {
    id: 't1', abiertoPor: 'u', abiertoEn: T, fondo: 100, cerradoPor: null, cerradoEn: null, contado: null, esperado: null,
    diferencia: null, notas: null, actualizadoEn: T, eliminadoEn: null,
  };
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    alCambiarCaja: () => cambios++,
    cliente: clienteFalso(
      () => pullDePrueba(),
      undefined,
      (ruta) => {
        rutas.push(ruta);
        return { ...cajaVacia, cursor: '2026-11-18T11:00:00.000Z', turnos: rutas.length === 1 ? [turno] : [] };
      },
    ),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(rutas).toEqual(['/sync/caja', `/sync/caja?desde=${encodeURIComponent('2026-11-18T11:00:00.000Z')}`]);
  expect(cambios).toBe(1);
  expect(leerKv(base, 'cursor:caja')).toBe('2026-11-18T11:00:00.000Z');
});

it('si el servidor rechaza caja.abrir, la caja optimista desaparece y se pide la caja completa', async () => {
  base.db.prepare("INSERT INTO turnos (id, abierto_por, abierto_en, fondo, actualizado_en) VALUES ('t9', 'u', 'x', 0, '')").run();
  escribirKv(base, 'cursor:caja', '2026-11-18T09:00:00.000Z');
  const op = encolar(base, { tipo: 'caja.abrir', datos: { turnoId: 't9', fondo: 0 } });
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso(
      (ruta) =>
        ruta === '/sync/operaciones'
          ? { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'CAJA_ABIERTA', mensaje: 'x' } }] }
          : pullDePrueba(),
      undefined,
      (ruta) => {
        rutas.push(ruta);
        return cajaVacia;
      },
    ),
  });
  await motor.sincronizarAhora();
  expect(base.db.prepare("SELECT count(*) AS n FROM turnos").get()).toEqual({ n: 0 });
  expect(rutas[0]).toBe('/sync/caja');
});

it('una operación con la que el servidor falla siempre termina rechazada sola y las demás se aplican en orden', async () => {
  const ops = Array.from({ length: 5 }, (_, i) => encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: `p${i}`, disponible: false } }));
  const x = ops[2]!;
  const aplicadas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta, cuerpo) => {
      if (ruta !== '/sync/operaciones') return pullDePrueba();
      const lote = (cuerpo as { operaciones: { id: string }[] }).operaciones;
      if (lote.some((o) => o.id === x.id)) throw new ErrorApiCliente(500, 'ERROR_INTERNO', 'Error interno');
      aplicadas.push(...lote.map((o) => o.id));
      return { resultados: lote.map((o) => ({ id: o.id, estado: 'aplicada' })) };
    }),
  });
  for (let i = 0; i < 60 && contarPendientes(base) > 0; i++) await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(aplicadas).toEqual([ops[0]!.id, ops[1]!.id, ops[3]!.id, ops[4]!.id]);
  expect(leerRechazadas(base)).toEqual([expect.objectContaining({ id: x.id, error: 'ERROR_SERVIDOR' })]);
});

it('sin conexión nunca se rechaza nada por reintentos', async () => {
  encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const motor = crearMotor({ base, cliente: clienteFalso(() => { throw new SinConexion(); }), crearSocket: sinSocket });
  for (let i = 0; i < 40; i++) await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(1);
});

it('si el servidor entero falla (también el pull), no se rechaza ninguna operación', async () => {
  encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso(() => {
      throw new ErrorApiCliente(500, 'ERROR_INTERNO', 'Error interno');
    }),
  });
  for (let i = 0; i < 40; i++) await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(1);
  expect(leerRechazadas(base)).toEqual([]);
});

it('un 503 (servidor no disponible) no cuenta como culpa de la operación', async () => {
  encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      if (ruta === '/sync/operaciones') throw new ErrorApiCliente(503, 'NO_DISPONIBLE', 'No disponible');
      return pullDePrueba();
    }),
  });
  for (let i = 0; i < 40; i++) await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(1);
});

it('calcula el desfase del reloj de la PC con la fecha que manda el servidor', async () => {
  const cliente = {
    ...clienteFalso(() => pullDePrueba()),
    fechaServidor: () => new Date(Date.now() + 10 * 60_000).toUTCString(),
  };
  const motor = crearMotor({ base, crearSocket: sinSocket, cliente });
  expect(motor.estado().desfaseReloj).toBeNull();
  await motor.sincronizarAhora();
  expect(Math.abs(motor.estado().desfaseReloj! - 600_000)).toBeLessThan(2_000);
});
