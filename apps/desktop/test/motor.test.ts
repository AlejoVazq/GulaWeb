import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { contarPendientes, encolar, pendientes } from '../src/main/db/outbox';
import { escribirKv } from '../src/main/db/kv';
import { crearMotor, type EstadoSync } from '../src/main/sync/motor';
import { SinConexion } from '../src/main/api/cliente';
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
function clienteFalso(responder: Respuesta, salon?: Respuesta) {
  return {
    pedir: async <T>(_m: string, ruta: string, cuerpo?: unknown) => {
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
