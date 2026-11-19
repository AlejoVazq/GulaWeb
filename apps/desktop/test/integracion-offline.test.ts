import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../../api/src/db/conLocal';
import { cobros, mesas, pedidos, turnosCaja, usuarios } from '../../api/src/db/schema/index';
import { appDePrueba, escenario, type Escenario } from '../../api/test/app';
import { dbs, limpiarDb } from '../../api/test/db';
import { cartaChica, mesaDePrueba, type CartaChica } from '../../api/test/salon';
import { migrar } from '../../api/src/db/migrar';
import { envValido } from '../../api/test/helpers';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { contarPendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { crearCliente } from '../src/main/api/cliente';
import { crearMotor, type CrearSocket, type Motor } from '../src/main/sync/motor';
import { crearServicios } from '../src/main/servicios';
import { describirRechazo } from '../src/compartido/rechazos';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
let app: Awaited<ReturnType<typeof appDePrueba>>;
let e: Escenario;
let c: CartaChica;
let rutaBase: string;
let base: BaseLocal;
let url: string;
let puerto: number;
let n = 0;
const motores: Motor[] = [];

beforeEach(async () => {
  await migrar(envValido.DATABASE_ADMIN_URL);
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dir = app.server.address();
  puerto = typeof dir === 'object' && dir ? dir.port : 0;
  url = `http://127.0.0.1:${puerto}`;
  rutaBase = tmp.ruta(`io${n++}.db`);
  base = abrirBase(rutaBase);
});
afterEach(async () => {
  // Detener y esperar el sync que haya quedado en vuelo antes de cerrar la base.
  for (const m of motores.splice(0)) {
    m.detener();
    await m.sincronizarAhora().catch(() => undefined);
  }
  base.cerrar();
  await app.close();
});
afterAll(() => dbs.cerrar());

const sinSocket: CrearSocket = () => ({ on: () => {}, close: () => {}, connect: () => {} });

/** PC con una red que se puede cortar; `reiniciar` simula apagarla y prenderla (misma base, todo lo demás nuevo). */
async function pc(opciones: { socketReal?: boolean } = {}) {
  const red = { hay: true };
  const fetchCortable: typeof fetch = (entrada, init) =>
    red.hay ? fetch(entrada, init) : Promise.reject(new TypeError('fetch failed'));
  const armar = () => {
    const sesion = crearSesion(base, identidad);
    const cliente = crearCliente({ urlBase: url, sesion, fetch: fetchCortable });
    const motor = crearMotor({ base, cliente, ...(opciones.socketReal ? {} : { crearSocket: sinSocket }) });
    motores.push(motor);
    const servicios = crearServicios({ base, sesion, cliente, motor, emitir: vi.fn(), elegirArchivo: async () => null, cifrador: identidad });
    return { servicios, motor };
  };
  let actual = armar();
  await actual.servicios['sesion:login']({ email: 'dueno@local.com', password: 'secreto123', nombrePc: 'PC prueba' });
  if (!opciones.socketReal) actual.motor.detener(); // la prueba decide cuándo sincronizar
  await actual.motor.sincronizarAhora();
  return {
    get servicios() {
      return actual.servicios;
    },
    get motor() {
      return actual.motor;
    },
    cortar: () => (red.hay = false),
    volver: () => (red.hay = true),
    /** Se corta la luz: se cierra todo y se vuelve a abrir con la misma carpeta de datos. */
    async reiniciar() {
      actual.motor.detener();
      await actual.motor.sincronizarAhora().catch(() => undefined); // nada en vuelo contra la base vieja
      base.cerrar();
      base = abrirBase(rutaBase);
      actual = armar();
    },
  };
}

const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);
const hamburguesa = () => ({ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.grande] }, nota: '', cantidad: 2 }); // 2 × $ 6.500
const duenoId = async () =>
  (await dbs.dbAdmin.select().from(usuarios).where(and(eq(usuarios.localId, e.localId), eq(usuarios.rol, 'dueno'))))[0]!.id;
const esperar = async (condicion: () => boolean | Promise<boolean>, ms = 20_000) => {
  const fin = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > fin) throw new Error('Tiempo agotado esperando la condición');
    await new Promise((r) => setTimeout(r, 100));
  }
};

it('se corta la luz sin internet: la PC abre, se entra con PIN, se sigue operando y al volver llega todo una vez', async () => {
  const m1 = await mesaDePrueba(e.localId, 'Mesa 1', false);
  const m2 = await mesaDePrueba(e.localId, 'Mesa 2', false);
  const dueno = await duenoId();
  const p = await pc();
  // Con red entran el dueño y la moza (queda el verificador de cada uno) y se abre la caja.
  await p.servicios['sesion:usuarios']();
  await p.servicios['sesion:elegirUsuario']({ usuarioId: dueno, pin: '1234' });
  await p.servicios['caja:abrir']({ fondo: 0 });
  await p.servicios['sesion:elegirUsuario']({ usuarioId: e.mozaId, pin: '4321' });
  await p.motor.sincronizarAhora();

  p.cortar();
  const { sesionId } = await p.servicios['salon:abrirMesa']({ mesaId: m1.id });
  await p.servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [hamburguesa()] });
  await p.servicios['sesion:elegirUsuario']({ usuarioId: dueno, pin: '1234' });
  await p.servicios['caja:cobrar']({ destino: { sesionId }, pagos: [{ metodo: 'efectivo', monto: 1300000, propina: 0 }] });
  const antes = contarPendientes(base);
  expect(antes).toBeGreaterThanOrEqual(3);

  await p.reiniciar();
  expect(await p.servicios['sesion:estado']()).toMatchObject({ tipo: 'bloqueada' });
  const lista = await p.servicios['sesion:usuarios']();
  expect(lista.map((u) => u.id).sort()).toEqual([dueno, e.mozaId].sort());
  expect(await p.servicios['sesion:elegirUsuario']({ usuarioId: e.mozaId, pin: '4321' })).toMatchObject({
    tipo: 'activa',
    usuario: { id: e.mozaId, rol: 'mesero' },
  });
  expect((await p.servicios['sync:estado']()).pendientes).toBe(antes);
  const otra = await p.servicios['salon:abrirMesa']({ mesaId: m2.id });
  await p.servicios['salon:crearPedido']({ origen: 'manual', sesionId: otra.sesionId, items: [hamburguesa()] });
  await p.motor.sincronizarAhora();
  expect(p.motor.estado().conexion).toBe('sin-conexion');

  p.volver();
  await p.motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(p.motor.estado().rechazadas).toBe(0);
  const ps = await leer((tx) => tx.select().from(pedidos));
  expect(ps).toHaveLength(2);
  expect(ps.find((x) => x.mesaId === m1.id || x.sesionId === sesionId)!.estado).toBe('cobrado');
  const cs = await leer((tx) => tx.select().from(cobros));
  expect(cs).toHaveLength(1);
  expect(cs[0]!.cobradoPor ?? dueno).toBe(dueno);
  // Lo de la moza quedó a su nombre aunque el token era del dueño.
  expect(ps.find((x) => x.sesionId === otra.sesionId)!.creadoPor).toBe(e.mozaId);
});

it('en cascada: la mesa se borró en el servidor durante el corte → se revierte todo y la caja vuelve a coincidir', async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 4', false);
  const p = await pc();
  await p.servicios['caja:abrir']({ fondo: 500000 });
  await p.motor.sincronizarAhora();

  p.cortar();
  const { sesionId } = await p.servicios['salon:abrirMesa']({ mesaId: mesa.id });
  await p.servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [hamburguesa()] });
  await p.servicios['caja:cobrar']({ destino: { sesionId }, pagos: [{ metodo: 'efectivo', monto: 1300000, propina: 0 }] });
  expect((await p.servicios['caja:leer']()).cobros).toHaveLength(1);
  await leer((tx) => tx.update(mesas).set({ eliminadoEn: new Date() }).where(eq(mesas.id, mesa.id)));

  p.volver();
  await p.motor.sincronizarAhora();
  const rechazadas = await p.servicios['sync:rechazadas']();
  const tipos = rechazadas.map((o) => o.tipo);
  expect(tipos).toEqual(expect.arrayContaining(['mesa.abrir', 'pedido.crear', 'cuenta.cobrar']));
  expect(contarPendientes(base)).toBe(0);
  // Lo optimista desapareció: ni la mesa ni el cobro.
  expect((await p.servicios['salon:leer']()).mesas.map((m) => m.nombre)).not.toContain('Mesa 4');
  const caja = await p.servicios['caja:leer']();
  expect(caja.cobros).toHaveLength(0);
  expect(await leer((tx) => tx.select().from(cobros))).toHaveLength(0);
  const [t] = await leer((tx) => tx.select().from(turnosCaja));
  expect(caja.turno).toMatchObject({ id: t!.id, fondo: 500000 });
  expect(describirRechazo(rechazadas.find((o) => o.tipo === 'mesa.abrir')!)).toBe('No se pudo abrir la Mesa 4: la mesa ya no existe.');
});

it('un día entero sin red: cientos de operaciones viajan en lotes, en orden, y el arqueo coincide', { timeout: 120_000 }, async () => {
  const lista = [];
  for (let i = 1; i <= 40; i++) lista.push(await mesaDePrueba(e.localId, `Mesa ${i}`, false));
  const p = await pc();
  await p.motor.sincronizarAhora();

  p.cortar();
  await p.servicios['caja:abrir']({ fondo: 1000000 });
  for (const m of lista) {
    const { sesionId } = await p.servicios['salon:abrirMesa']({ mesaId: m.id });
    for (let k = 0; k < 3; k++) await p.servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [hamburguesa()] });
    await p.servicios['caja:cobrar']({ destino: { sesionId }, pagos: [{ metodo: 'efectivo', monto: 3900000, propina: 0 }] });
  }
  const cliente = { nombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: '' };
  for (let i = 0; i < 10; i++) await p.servicios['delivery:crear']({ cliente, costoEnvio: 0, items: [hamburguesa()] });
  for (let i = 0; i < 5; i++)
    await p.servicios['caja:movimiento']({ tipo: 'egreso', categoria: 'proveedores', monto: 10000, motivo: `Compra ${i}` });
  const local = await p.servicios['caja:cerrar']({ contado: 1000000 + 40 * 3900000 - 5 * 10000 });
  expect(local.diferencia).toBe(0);
  expect(contarPendientes(base)).toBeGreaterThan(200);

  p.volver();
  await p.motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(p.motor.estado().rechazadas).toBe(0);
  expect(await leer((tx) => tx.select().from(cobros))).toHaveLength(40);
  expect(await leer((tx) => tx.select().from(pedidos))).toHaveLength(130);
  const [t] = await leer((tx) => tx.select().from(turnosCaja));
  expect(t).toMatchObject({ esperado: local.esperado, contado: local.esperado, diferencia: 0 });
});

it('el servidor se reinicia (deploy): la PC reconecta sola y los QR vuelven a aceptar pedidos', { timeout: 60_000 }, async () => {
  const mesa = await mesaDePrueba(e.localId, 'Mesa 7', true);
  const p = await pc({ socketReal: true });
  const pcs = () => app.pcsConectadas(e.localId);
  await esperar(() => pcs() > 0);

  await app.close();
  await esperar(() => p.motor.estado().conexion === 'sin-conexion');
  app = await appDePrueba();
  await app.listen({ port: puerto, host: '127.0.0.1' });

  await esperar(() => pcs() > 0 && p.motor.estado().conexion === 'en-linea');
  const r = await fetch(`${url}/publico/mesas/${mesa.token}/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: nuevoId(), items: [{ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.chica] }, nota: '', cantidad: 1 }] }),
  });
  expect(r.status).toBe(201);
});
