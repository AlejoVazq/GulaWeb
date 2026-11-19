import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../../api/src/db/conLocal';
import { itemsPedido, pedidos, sesionesMesa } from '../../api/src/db/schema/index';
import { appDePrueba, escenario, type Escenario } from '../../api/test/app';
import { dbs, limpiarDb } from '../../api/test/db';
import { cartaChica, mesaDePrueba, type CartaChica } from '../../api/test/salon';
import { migrar } from '../../api/src/db/migrar';
import { envValido } from '../../api/test/helpers';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { contarPendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { crearCliente } from '../src/main/api/cliente';
import { crearMotor } from '../src/main/sync/motor';
import { crearServicios } from '../src/main/servicios';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
let app: Awaited<ReturnType<typeof appDePrueba>>;
let e: Escenario;
let c: CartaChica;
let base: BaseLocal;
let url: string;
let n = 0;
const sockets: Socket[] = [];

beforeEach(async () => {
  await migrar(envValido.DATABASE_ADMIN_URL);
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dir = app.server.address();
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
  base = abrirBase(tmp.ruta(`is${n++}.db`));
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  base.cerrar();
  await app.close();
});
afterAll(() => dbs.cerrar());

/** PC con una red que se puede cortar. */
async function pc() {
  let red = true;
  const fetchCortable: typeof fetch = (entrada, init) =>
    red ? fetch(entrada, init) : Promise.reject(new TypeError('fetch failed'));
  const sesion = crearSesion(base, identidad);
  const cliente = crearCliente({ urlBase: url, sesion, fetch: fetchCortable });
  const motor = crearMotor({ base, cliente, crearSocket: () => ({ on: () => {}, close: () => {}, connect: () => {} }) });
  const servicios = crearServicios({ base, sesion, cliente, motor, emitir: vi.fn(), elegirArchivo: async () => null });
  await servicios['sesion:login']({ email: 'dueno@local.com', password: 'secreto123', nombrePc: 'PC prueba' });
  motor.detener(); // la prueba decide cuándo sincronizar
  await motor.sincronizarAhora();
  return {
    servicios,
    motor,
    token: () => cliente.tokenActual(),
    cortar: () => (red = false),
    volver: () => (red = true),
  };
}

const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);

it('sin conexión abre una mesa y carga un pedido; al volver la red llega todo una sola vez', async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 3', false);
  const { servicios, motor, cortar, volver } = await pc();
  expect((await servicios['salon:leer']()).mesas.map((m) => m.nombre)).toEqual(['Mesa 3']);

  cortar();
  const { sesionId } = await servicios['salon:abrirMesa']({ mesaId: mesa.id, comensales: 2 });
  const { numero } = await servicios['salon:crearPedido']({
    origen: 'manual',
    sesionId,
    items: [{ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.grande] }, nota: '', cantidad: 1 }],
  });
  expect(numero).toBe(1);
  await motor.sincronizarAhora();
  expect(motor.estado().conexion).toBe('sin-conexion');
  expect(contarPendientes(base)).toBe(2);
  expect(await leer((tx) => tx.select().from(pedidos))).toEqual([]);

  volver();
  await motor.sincronizarAhora();
  await motor.sincronizarAhora(); // un segundo envío no duplica nada
  expect(contarPendientes(base)).toBe(0);
  const sesiones = await leer((tx) => tx.select().from(sesionesMesa));
  expect(sesiones).toHaveLength(1);
  expect(sesiones[0]).toMatchObject({ id: sesionId, estado: 'abierta', comensales: 2 });
  const ps = await leer((tx) => tx.select().from(pedidos));
  expect(ps).toHaveLength(1);
  expect(ps[0]).toMatchObject({ origen: 'manual', estado: 'confirmado', numero: 1, sesionId });
  const its = await leer((tx) => tx.select().from(itemsPedido));
  expect(its).toMatchObject([{ precioUnitario: 650000, resumenOpciones: 'Grande' }]);

  // Tras el pull, lo local es la versión del servidor.
  const d = await servicios['salon:mesa'](mesa.id);
  expect(d!.pedidos).toHaveLength(1);
  expect(d!.pedidos[0]!.total).toBe(650000);
});

it('un pedido QR creado en la API aparece en pendientes tras el pull y se confirma', async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 1', true);
  const { servicios, motor, token } = await pc();
  // Presencia: la PC conectada por tiempo real (el login la dejó como único dispositivo del local).
  await new Promise<void>((ok, mal) => {
    const s = io(url, { path: '/tiempo-real', auth: { token: token() }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => ok());
    s.on('connect_error', mal);
  });
  const pedidoId = nuevoId();
  const r = await fetch(`${url}/publico/mesas/${mesa.token}/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pedidoId, items: [{ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.chica] }, nota: '', cantidad: 2 }] }),
  });
  expect(r.status).toBe(201);

  await motor.sincronizarAhora();
  const s = await servicios['salon:leer']();
  expect(s.pendientes.map((p) => p.id)).toEqual([pedidoId]);
  expect(s.pendientes[0]).toMatchObject({ mesa: { id: mesa.id, nombre: 'Mesa 1' }, total: 1000000 });

  await servicios['salon:confirmar']({ pedidoId });
  await motor.sincronizarAhora();
  const estado = await fetch(`${url}/publico/pedidos/${pedidoId}?token=${mesa.token}`);
  expect(await estado.json()).toMatchObject({ estado: 'confirmado' });
  const [p] = await leer((tx) => tx.select().from(pedidos));
  expect(p).toMatchObject({ estado: 'confirmado', numero: 1 });
});
