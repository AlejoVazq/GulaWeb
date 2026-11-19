import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { auditoria, cobros, itemsPedido, pagos, pedidos, sesionesMesa } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { cartaChica, mesaDePrueba, type CartaChica } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
let c: CartaChica;
let turnoId: string;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
  turnoId = nuevoId();
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

type R = { estado: string; error?: { codigo: string } };
const op = (tipo: string, datos: unknown, extra: object = {}) => ({ id: nuevoId(), tipo, datos, creadaEn: new Date().toISOString(), ...extra });
async function enviar(token: string, ...operaciones: unknown[]) {
  const r = await pedir(app, token)('POST', '/sync/operaciones', { operaciones });
  return r.json().resultados as R[];
}
const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);

const item = (precioUnitario: number, cantidad = 1) => ({
  itemId: nuevoId(), productoId: c.hamburguesa, nombre: 'Hamburguesa', precioUnitario, cantidad,
  seleccion: { [c.tamano]: [c.grande] }, resumenOpciones: 'Grande', nota: '', sectorId: c.cocina,
});
let numero = 1;
async function pedidoEnMesa(sesionId: string | null, precio: number, origen: 'manual' | 'mostrador' = 'manual') {
  const pedidoId = nuevoId();
  const i = item(precio);
  const [r] = await enviar(e.tokenMoza, op('pedido.crear', { pedidoId, origen, sesionId, numero: numero++, dia: '2026-11-18', items: [i] }));
  expect(r!.estado).toBe('aplicada');
  return { pedidoId, itemId: i.itemId };
}
const abrirCaja = () => enviar(e.tokenEncargado, op('caja.abrir', { turnoId, fondo: 1000000 }));
const cobrar = (datos: object) => enviar(e.tokenEncargado, op('cuenta.cobrar', { cobroId: nuevoId(), turnoId, descuento: null, ...datos }));

it('cobrar una mesa con pago dividido deja los pedidos cobrados y la mesa cerrada', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const a = await pedidoEnMesa(m.sesionId, 1200000);
  const b = await pedidoEnMesa(m.sesionId, 800000);
  const [r] = await cobrar({
    sesionId: m.sesionId,
    pedidoIds: [a.pedidoId, b.pedidoId],
    subtotal: 2000000,
    pagos: [
      { pagoId: nuevoId(), metodo: 'efectivo', monto: 1200000, propina: 100000 },
      { pagoId: nuevoId(), metodo: 'debito', monto: 800000, propina: 0 },
    ],
  });
  expect(r!.estado).toBe('aplicada');
  const ps = await leer((tx) => tx.select().from(pedidos));
  expect(ps.filter((p) => [a.pedidoId, b.pedidoId].includes(p.id)).map((p) => p.estado)).toEqual(['cobrado', 'cobrado']);
  const [s] = await leer((tx) => tx.select().from(sesionesMesa).where(eq(sesionesMesa.id, m.sesionId!)));
  expect(s!.estado).toBe('cerrada');
  const [cobro] = await leer((tx) => tx.select().from(cobros));
  expect(cobro).toMatchObject({ subtotal: 2000000, descuento: 0, total: 2000000, turnoId });
  expect(await leer((tx) => tx.select().from(pagos))).toHaveLength(2);
});

it('pagos que no suman el total se rechazan', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pedidoEnMesa(m.sesionId, 1000000);
  const [r] = await cobrar({ sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 1000000, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 1100000, propina: 0 }] });
  expect(r!.error!.codigo).toBe('DATOS_INVALIDOS');
});

it('sin caja abierta no se cobra', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pedidoEnMesa(m.sesionId, 1000000);
  const [r] = await cobrar({ sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 1000000, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 1000000, propina: 0 }] });
  expect(r!.error!.codigo).toBe('CAJA_CERRADA');
});

it('un descuento necesita motivo y queda auditado', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pedidoEnMesa(m.sesionId, 1000000);
  const pago = { pagoId: nuevoId(), metodo: 'efectivo', monto: 900000, propina: 0 };
  const [sin] = await cobrar({ sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 1000000, descuento: { monto: 100000, motivo: '' }, pagos: [pago] });
  expect(sin!.error!.codigo).toBe('DATOS_INVALIDOS');
  const [con] = await cobrar({ sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 1000000, descuento: { monto: 100000, motivo: 'Cliente habitual' }, pagos: [pago] });
  expect(con!.estado).toBe('aplicada');
  const [a] = await leer((tx) => tx.select().from(auditoria).where(eq(auditoria.accion, 'cobro.descuento')));
  expect(a!.despues).toMatchObject({ descuento: 100000, motivo: 'Cliente habitual' });
});

it('un pedido de mostrador se cobra solo', async () => {
  await abrirCaja();
  const { pedidoId } = await pedidoEnMesa(null, 300000, 'mostrador');
  const [r] = await cobrar({ pedidoId, subtotal: 300000, pagos: [{ pagoId: nuevoId(), metodo: 'mercadopago', monto: 300000, propina: 0 }] });
  expect(r!.estado).toBe('aplicada');
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p!.estado).toBe('cobrado');
});

it('cobrar dos veces la misma mesa: el segundo se rechaza', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pedidoEnMesa(m.sesionId, 500000);
  const datos = { sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 500000, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 500000, propina: 0 }] };
  await cobrar(datos);
  const [r] = await cobrar({ ...datos, pagos: [{ ...datos.pagos[0]!, pagoId: nuevoId() }] });
  expect(r!.error!.codigo).toBe('ESTADO_INVALIDO');
  expect(await leer((tx) => tx.select().from(cobros))).toHaveLength(1);
});

it('una moza no puede anular sin el PIN de un encargado', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId, itemId } = await pedidoEnMesa(m.sesionId, 500000);
  const [sin] = await enviar(e.tokenMoza, op('item.anular', { itemId, pedidoId, motivo: 'Se equivocó' }));
  expect(sin!.error!.codigo).toBe('REQUIERE_AUTORIZACION');
  const [conMoza] = await enviar(
    e.tokenMoza,
    op('item.anular', { itemId, pedidoId, motivo: 'Se equivocó' }, { autorizacion: { usuarioId: e.mozaId, pin: '4321' } }),
  );
  expect(conMoza!.error!.codigo).toBe('REQUIERE_AUTORIZACION');
});

it('con el PIN del encargado se anula, queda auditado y el pedido sin ítems pasa a anulado', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId, itemId } = await pedidoEnMesa(m.sesionId, 500000);
  const [r] = await enviar(
    e.tokenMoza,
    op('item.anular', { itemId, pedidoId, motivo: 'Se equivocó' }, { autorizacion: { usuarioId: e.encId, pin: '5555' } }),
  );
  expect(r!.estado).toBe('aplicada');
  const [i] = await leer((tx) => tx.select().from(itemsPedido).where(eq(itemsPedido.id, itemId)));
  expect(i).toMatchObject({ anulado: true, motivoAnulacion: 'Se equivocó' });
  expect(i!.anuladoPor).toBe(e.mozaId);
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p!.estado).toBe('anulado');
  const [a] = await leer((tx) => tx.select().from(auditoria).where(and(eq(auditoria.accion, 'item.anular'), eq(auditoria.entidadId, itemId))));
  expect(a!.autorizadoPor).toBe(e.encId);
  // Con el pedido anulado, la mesa se puede cerrar.
  const [cierre] = await enviar(e.tokenMoza, op('mesa.cerrar', { sesionId: m.sesionId }));
  expect(cierre!.estado).toBe('aplicada');
});

it('no se anula un pedido ya cobrado', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pedidoEnMesa(m.sesionId, 500000);
  await cobrar({ sesionId: m.sesionId, pedidoIds: [pedidoId], subtotal: 500000, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 500000, propina: 0 }] });
  const [r] = await enviar(e.tokenEncargado, op('pedido.anular', { pedidoId, motivo: 'x' }));
  expect(r!.error!.codigo).toBe('ESTADO_INVALIDO');
});

it('el cobro marca solo los pedidos que lista; si queda otro confirmado la mesa sigue abierta y se audita', async () => {
  // Como cuando una anulación offline con PIN inválido se rechaza antes del cobro.
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  const cobrado = await pedidoEnMesa(m.sesionId, 500000);
  const fuera = await pedidoEnMesa(m.sesionId, 300000);
  const [r] = await cobrar({
    sesionId: m.sesionId, pedidoIds: [cobrado.pedidoId], subtotal: 500000,
    pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 500000, propina: 0 }],
  });
  expect(r!.estado).toBe('aplicada');
  const ps = await leer((tx) => tx.select().from(pedidos));
  expect(ps.find((p) => p.id === cobrado.pedidoId)!.estado).toBe('cobrado');
  expect(ps.find((p) => p.id === fuera.pedidoId)!.estado).toBe('confirmado');
  const [s] = await leer((tx) => tx.select().from(sesionesMesa).where(eq(sesionesMesa.id, m.sesionId!)));
  expect(s!.estado).not.toBe('cerrada');
  const [a] = await leer((tx) => tx.select().from(auditoria).where(eq(auditoria.accion, 'cobro.discrepancia')));
  expect(a!.despues).toMatchObject({ sinCobrar: [fuera.pedidoId] });
});

it('un cobro de mesa sin la lista de pedidos se rechaza', async () => {
  await abrirCaja();
  const m = await mesaDePrueba(e.localId);
  await pedidoEnMesa(m.sesionId, 500000);
  const [r] = await cobrar({ sesionId: m.sesionId, subtotal: 500000, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: 500000, propina: 0 }] });
  expect(r!.error!.codigo).toBe('DATOS_INVALIDOS');
});
