import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { conLocal } from '../../api/src/db/conLocal';
import { and, eq } from 'drizzle-orm';
import { auditoria, cobros, deliveries, pedidos, usuarios } from '../../api/src/db/schema/index';
import { appDePrueba, escenario, type Escenario } from '../../api/test/app';
import { dbs, limpiarDb } from '../../api/test/db';
import { cartaChica, type CartaChica } from '../../api/test/salon';
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
  base = abrirBase(tmp.ruta(`id${n++}.db`));
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
const hamburguesa = () => ({ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.grande] }, nota: '', cantidad: 2 }); // 2 × $ 6.500

const duenoId = async () =>
  (await dbs.dbAdmin.select().from(usuarios).where(and(eq(usuarios.localId, e.localId), eq(usuarios.rol, 'dueno'))))[0]!.id;
const cliente = { nombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: '' };

it('sin red se cargan, salen, se cobran y se entregan deliveries; al volver el servidor queda igual', async () => {
  const { servicios, motor, cortar, volver } = await pc();
  await servicios['caja:abrir']({ fondo: 0 });

  // La moza carga los pedidos sin conexión y cancela uno con el PIN del encargado.
  await servicios['sesion:elegirUsuario']({ usuarioId: e.mozaId, pin: '4321' });
  cortar();
  const uno = await servicios['delivery:crear']({ cliente, costoEnvio: 150000, pagaCon: 2000000, items: [hamburguesa()] });
  const dos = await servicios['delivery:crear']({ cliente: { ...cliente, nombre: 'Pedro' }, costoEnvio: 0, items: [hamburguesa()] });
  await servicios['delivery:estado']({ pedidoId: uno.pedidoId, estado: 'en_camino', repartidor: 'Juan' });
  await servicios['salon:anularPedido']({ pedidoId: dos.pedidoId, motivo: 'Canceló', autorizacion: { usuarioId: e.encId, pin: '5555' } });
  await motor.sincronizarAhora();
  expect(motor.estado().conexion).toBe('sin-conexion');

  // Vuelve el dueño (el cambio de usuario necesita red) y cobra y entrega sin conexión.
  volver();
  await servicios['sesion:elegirUsuario']({ usuarioId: await duenoId(), pin: '1234' });
  cortar();
  const t = await servicios['delivery:tablero']();
  expect(t.enCamino[0]!.aCobrar).toBe(1450000);
  await servicios['caja:cobrar']({ destino: { pedidoId: uno.pedidoId }, pagos: [{ metodo: 'efectivo', monto: 1450000, propina: 0 }] });
  await servicios['delivery:estado']({ pedidoId: uno.pedidoId, estado: 'entregado' });

  volver();
  await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(motor.estado().rechazadas).toBe(0);
  const ps = await leer((tx) => tx.select().from(pedidos));
  expect(Object.fromEntries(ps.map((p) => [p.id, [p.origen, p.estado]]))).toEqual({
    [uno.pedidoId]: ['delivery', 'cobrado'],
    [dos.pedidoId]: ['delivery', 'anulado'],
  });
  const [d1] = await leer((tx) => tx.select().from(deliveries).where(eq(deliveries.id, uno.pedidoId)));
  expect(d1).toMatchObject({ estado: 'entregado', repartidor: 'Juan', costoEnvio: 150000 });
  const cs = await leer((tx) => tx.select().from(cobros));
  expect(cs).toHaveLength(1);
  expect(cs[0]).toMatchObject({ pedidoId: uno.pedidoId, total: 1450000 });
  const [anul] = await leer((tx) => tx.select().from(auditoria).where(eq(auditoria.accion, 'pedido.anular')));
  expect(anul!.autorizadoPor).toBe(e.encId);
  // Tras el pull, la PC muestra lo mismo que el servidor.
  const despues = await servicios['delivery:tablero']();
  expect(despues.entregados.map((p) => p.id)).toEqual([uno.pedidoId]);
  expect(despues.cancelados.map((p) => p.id)).toEqual([dos.pedidoId]);
});
