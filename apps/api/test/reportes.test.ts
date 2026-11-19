import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId, type MetodoPago } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { cobros, deliveries, itemsPedido, mesas, movimientosCaja, pagos, pedidos, sesionesMesa, turnosCaja } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let turnoId: string;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  turnoId = nuevoId();
  await leer((tx) => tx.insert(turnosCaja).values({ id: turnoId, localId: e.localId, abiertoPor: e.encId, fondo: 0 }));
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const leer = <T>(fn: Parameters<typeof conLocal<T>>[2], localId = e.localId) => conLocal(dbs.dbApp, localId, fn);
/** Hora de Buenos Aires (UTC−3) → Date. */
const ba = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`);
const productoA = nuevoId();
const productoB = nuevoId();

type Venta = {
  en: Date;
  pagos: { metodo: MetodoPago; monto: number; propina?: number }[];
  descuento?: number;
  origen?: 'manual' | 'mostrador' | 'delivery';
  items?: { productoId: string; nombre: string; precio: number; cantidad: number }[];
  creadoPor?: string;
  envio?: number;
  sesionId?: string;
  mesaId?: string;
  pedidoId?: string;
  cobrar?: boolean;
};
/** Inserta un pedido con sus ítems y (salvo cobrar:false) su cobro y pagos. */
async function venta(v: Venta, localId = e.localId) {
  const pedidoId = v.pedidoId ?? nuevoId();
  const items = v.items ?? [{ productoId: productoA, nombre: 'Pizza', precio: v.pagos.reduce((s, p) => s + p.monto, 0) + (v.descuento ?? 0) - (v.envio ?? 0), cantidad: 1 }];
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0) + (v.envio ?? 0);
  const origen = v.origen ?? 'mostrador';
  await leer(async (tx) => {
    await tx.insert(pedidos).values({
      id: pedidoId, localId, origen, estado: v.cobrar === false ? 'confirmado' : 'cobrado', sesionId: v.sesionId ?? null, mesaId: v.mesaId ?? null,
      numero: 1, dia: '2026-11-18', creadoPor: v.creadoPor ?? e.mozaId, creadoEn: v.en,
    });
    await tx.insert(itemsPedido).values(
      items.map((i) => ({ id: nuevoId(), localId, pedidoId, productoId: i.productoId, nombre: i.nombre, precioUnitario: i.precio, cantidad: i.cantidad })),
    );
    if (origen === 'delivery')
      await tx.insert(deliveries).values({ id: pedidoId, localId, pedidoId, clienteNombre: 'X', direccion: 'Y', costoEnvio: v.envio ?? 0, estado: 'entregado' });
    if (v.cobrar === false) return;
    const cobroId = nuevoId();
    await tx.insert(cobros).values({
      id: cobroId, localId, turnoId, sesionId: v.sesionId ?? null, pedidoId: v.sesionId ? null : pedidoId,
      subtotal, descuento: v.descuento ?? 0, total: subtotal - (v.descuento ?? 0), cobradoPor: e.encId, cobradoEn: v.en,
    });
    await tx.insert(pagos).values(v.pagos.map((p) => ({ id: nuevoId(), localId, cobroId, turnoId, metodo: p.metodo, monto: p.monto, propina: p.propina ?? 0 })));
  }, localId);
  return pedidoId;
}
const egreso = (monto: number, en: Date) =>
  leer((tx) => tx.insert(movimientosCaja).values({ id: nuevoId(), localId: e.localId, turnoId, tipo: 'egreso', categoria: 'proveedores', monto, motivo: 'Hielo', usuarioId: e.encId, hechoEn: en }));
const reporte = async (token: string, q: string) => {
  const r = await pedir(app, token)('GET', `/reportes?${q}`);
  return { status: r.statusCode, json: r.json() };
};

it('ventas, ticket promedio, propinas y métodos de un día', async () => {
  await venta({ en: ba('2026-11-18', '13:00'), pagos: [{ metodo: 'efectivo', monto: 1000000, propina: 100000 }] });
  await venta({ en: ba('2026-11-18', '21:15'), pagos: [{ metodo: 'debito', monto: 500000 }], descuento: 50000 });
  await venta({ en: ba('2026-11-17', '13:00'), pagos: [{ metodo: 'efectivo', monto: 1000000 }] });
  const { status, json } = await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18');
  expect(status).toBe(200);
  expect(json.rango).toEqual({ desde: '2026-11-18', hasta: '2026-11-18' });
  expect(json.rangoAnterior).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
  expect(json.actual).toMatchObject({ ventas: 1500000, cobros: 2, ticketPromedio: 750000, propinas: 100000, descuentos: 50000 });
  expect(json.actual.porMetodo).toEqual([
    { metodo: 'efectivo', monto: 1000000, propinas: 100000 },
    { metodo: 'debito', monto: 500000, propinas: 0 },
  ]);
  expect(json.actual.porHora).toEqual([
    { hora: 13, ventas: 1000000, cobros: 1 },
    { hora: 21, ventas: 500000, cobros: 1 },
  ]);
  expect(json.anterior).toMatchObject({ ventas: 1000000, cobros: 1 });
});

it('un cobro de madrugada cuenta para el día anterior', async () => {
  await venta({ en: ba('2026-11-19', '01:30'), pagos: [{ metodo: 'efectivo', monto: 300000 }] });
  const { json } = await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18');
  expect(json.actual.ventas).toBe(300000);
  expect((await reporte(e.tokenDueno, 'desde=2026-11-19&hasta=2026-11-19')).json.actual.ventas).toBe(0);
});

it('el resultado solo lo ve el dueño', async () => {
  await venta({ en: ba('2026-11-18', '13:00'), pagos: [{ metodo: 'efectivo', monto: 1500000 }] });
  await egreso(200000, ba('2026-11-18', '10:00'));
  const d = (await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18')).json;
  expect(d.actual).toMatchObject({ egresos: 200000, ingresos: 0, resultado: 1300000 });
  const enc = (await reporte(e.tokenEncargado, 'desde=2026-11-18&hasta=2026-11-18')).json;
  expect(enc.actual.ventas).toBe(1500000);
  expect(enc.actual).not.toHaveProperty('resultado');
  expect(enc.actual).not.toHaveProperty('egresos');
  expect(enc.anterior).not.toHaveProperty('resultado');
  expect((await reporte(e.tokenMoza, 'desde=2026-11-18&hasta=2026-11-18')).status).toBe(403);
});

it('origen: salón, mostrador y delivery (con envío)', async () => {
  const mesaId = nuevoId();
  const sesionId = nuevoId();
  await leer(async (tx) => {
    await tx.insert(mesas).values({ id: mesaId, localId: e.localId, nombre: 'Mesa 1', token: nuevoId() });
    await tx.insert(sesionesMesa).values({ id: sesionId, localId: e.localId, mesaId, estado: 'cerrada' });
  });
  await venta({ en: ba('2026-11-18', '13:00'), origen: 'manual', sesionId, mesaId, pagos: [{ metodo: 'efectivo', monto: 1000000 }] });
  await venta({ en: ba('2026-11-18', '14:00'), pagos: [{ metodo: 'efectivo', monto: 200000 }] });
  await venta({ en: ba('2026-11-18', '20:00'), origen: 'delivery', envio: 150000, pagos: [{ metodo: 'transferencia', monto: 950000 }] });
  const { json } = await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18');
  expect(json.actual.envios).toBe(150000);
  expect(json.actual.porOrigen).toEqual([
    { origen: 'salon', ventas: 1000000, cobros: 1 },
    { origen: 'mostrador', ventas: 200000, cobros: 1 },
    { origen: 'delivery', ventas: 950000, cobros: 1 },
  ]);
});

it('productos y meseros: cada pedido cuenta una vez aunque la mesa se cobre en dos veces', async () => {
  const mesaId = nuevoId();
  const sesionId = nuevoId();
  await leer(async (tx) => {
    await tx.insert(mesas).values({ id: mesaId, localId: e.localId, nombre: 'Mesa 1', token: nuevoId() });
    await tx.insert(sesionesMesa).values({ id: sesionId, localId: e.localId, mesaId, estado: 'cerrada' });
  });
  const items = [{ productoId: productoA, nombre: 'Pizza', precio: 100000, cantidad: 2 }];
  await venta({ en: ba('2026-11-18', '13:00'), origen: 'manual', sesionId, mesaId, items, pagos: [{ metodo: 'efectivo', monto: 200000 }] });
  await venta({
    en: ba('2026-11-18', '14:00'), origen: 'manual', sesionId, mesaId, creadoPor: e.encId,
    items: [{ productoId: productoB, nombre: 'Agua', precio: 50000, cantidad: 3 }], pagos: [{ metodo: 'efectivo', monto: 150000 }],
  });
  const { json } = await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18');
  expect(json.actual.productos).toEqual([
    { productoId: productoB, nombre: 'Agua', cantidad: 3, importe: 150000 },
    { productoId: productoA, nombre: 'Pizza', cantidad: 2, importe: 200000 },
  ]);
  expect(json.actual.meseros).toEqual([
    { usuarioId: e.mozaId, nombre: 'Ana', pedidos: 1, importe: 200000 },
    { usuarioId: e.encId, nombre: 'Enc', pedidos: 1, importe: 150000 },
  ]);
});

it('con tipo calendario el anterior es el mes anterior', async () => {
  const { json } = await reporte(e.tokenDueno, 'tipo=mes&desde=2026-03-01&hasta=2026-03-31');
  expect(json.rangoAnterior).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  expect(json.actual).toMatchObject({ ventas: 0, cobros: 0, ticketPromedio: 0, porMetodo: [], productos: [] });
});

it('rango inválido → 400; otro local no suma', async () => {
  expect((await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-10')).json.error.codigo).toBe('DATOS_INVALIDOS');
  expect((await reporte(e.tokenDueno, 'desde=x&hasta=2026-11-10')).status).toBe(400);
  const t = nuevoId();
  await leer((tx) => tx.insert(turnosCaja).values({ id: t, localId: e.otroLocalId, abiertoPor: e.encId, fondo: 0 }), e.otroLocalId);
  turnoId = t;
  await venta({ en: ba('2026-11-18', '13:00'), pagos: [{ metodo: 'efectivo', monto: 999900 }] }, e.otroLocalId);
  expect((await reporte(e.tokenDueno, 'desde=2026-11-18&hasta=2026-11-18')).json.actual.ventas).toBe(0);
});
