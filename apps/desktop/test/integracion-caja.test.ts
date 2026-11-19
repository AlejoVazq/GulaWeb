import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { conLocal } from '../../api/src/db/conLocal';
import { cobros, pagos, pedidos, sesionesMesa, turnosCaja } from '../../api/src/db/schema/index';
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
  base = abrirBase(tmp.ruta(`ic${n++}.db`));
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

it('sin red se abre la caja, se cobra una mesa dividida y se cierra; al volver el servidor da el mismo arqueo', async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 3', false);
  const { servicios, motor, cortar, volver } = await pc();

  cortar();
  await servicios['caja:abrir']({ fondo: 1000000 });
  const { sesionId } = await servicios['salon:abrirMesa']({ mesaId: mesa.id });
  await servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [hamburguesa()] });
  await servicios['caja:cobrar']({
    destino: { sesionId },
    pagos: [
      { metodo: 'efectivo', monto: 800000, propina: 50000 },
      { metodo: 'debito', monto: 500000, propina: 0 },
    ],
  });
  await servicios['caja:movimiento']({ tipo: 'egreso', categoria: 'proveedores', monto: 100000, motivo: 'Hielo' });
  const local = await servicios['caja:cerrar']({ contado: 1700000 });
  expect(local).toEqual({ esperado: 1750000, diferencia: -50000 });
  await motor.sincronizarAhora();
  expect(motor.estado().conexion).toBe('sin-conexion');

  volver();
  await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(motor.estado().rechazadas).toBe(0);
  const [t] = await leer((tx) => tx.select().from(turnosCaja));
  expect(t).toMatchObject({ fondo: 1000000, esperado: 1750000, contado: 1700000, diferencia: -50000 });
  expect(t!.cerradoEn).not.toBeNull();
  expect(await leer((tx) => tx.select().from(pagos))).toHaveLength(2);
  const [p] = await leer((tx) => tx.select().from(pedidos));
  expect(p!.estado).toBe('cobrado');
  const [s] = await leer((tx) => tx.select().from(sesionesMesa));
  expect(s!.estado).toBe('cerrada');
  // Tras el pull la PC muestra la versión del servidor: sin caja abierta y con el último cierre.
  const caja = await servicios['caja:leer']();
  expect(caja.turno).toBeNull();
  expect(caja.ultimoCierre).toMatchObject({ diferencia: -50000 });
});

it('cobrar dos veces seguidas la misma mesa deja un solo cobro', async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 4', false);
  const { servicios, motor } = await pc();
  await servicios['caja:abrir']({ fondo: 0 });
  const { sesionId } = await servicios['salon:abrirMesa']({ mesaId: mesa.id });
  await servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [hamburguesa()] });
  const datos = { destino: { sesionId }, pagos: [{ metodo: 'efectivo' as const, monto: 1300000, propina: 0 }] };
  const [a, b] = await Promise.allSettled([servicios['caja:cobrar'](datos), servicios['caja:cobrar'](datos)]);
  expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
  await motor.sincronizarAhora();
  expect(await leer((tx) => tx.select().from(cobros))).toHaveLength(1);
});
