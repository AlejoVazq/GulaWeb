import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { deliveries, pedidos } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { cartaChica, type CartaChica } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
let c: CartaChica;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

type R = { estado: string; error?: { codigo: string } };
const op = (tipo: string, datos: unknown) => ({ id: nuevoId(), tipo, datos, creadaEn: new Date().toISOString() });
async function enviar(token: string, ...operaciones: unknown[]) {
  const r = await pedir(app, token)('POST', '/sync/operaciones', { operaciones });
  return r.json().resultados as R[];
}
const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);

const cliente = { nombre: 'Juana Pérez', telefono: '11 5555-1234', direccion: 'Av. Siempreviva 742', referencias: 'Timbre B' };
let numero = 1;
async function crearDelivery(token = e.tokenMoza, extra: object = {}) {
  const pedidoId = nuevoId();
  const [r] = await enviar(
    token,
    op('delivery.crear', {
      pedidoId, numero: numero++, dia: '2026-11-19', cliente, costoEnvio: 150000, pagaCon: 2000000,
      items: [{
        itemId: nuevoId(), productoId: c.hamburguesa, nombre: 'Hamburguesa', precioUnitario: 500000, cantidad: 2,
        seleccion: { [c.tamano]: [c.chica] }, resumenOpciones: 'Chica', nota: '', sectorId: c.cocina,
      }],
      ...extra,
    }),
  );
  return { pedidoId, r: r! };
}
const estado = (pedidoId: string, estado: string, repartidor?: string) =>
  enviar(e.tokenMoza, op('delivery.estado', { pedidoId, estado, repartidor })).then((r) => r[0]!);
async function cobrar(pedidoId: string, subtotal: number) {
  const turnoId = nuevoId();
  await enviar(e.tokenEncargado, op('caja.abrir', { turnoId, fondo: 0 }));
  const [r] = await enviar(
    e.tokenEncargado,
    op('cuenta.cobrar', { cobroId: nuevoId(), turnoId, pedidoId, subtotal, descuento: null, pagos: [{ pagoId: nuevoId(), metodo: 'efectivo', monto: subtotal, propina: 0 }] }),
  );
  return r!;
}
const fila = async (pedidoId: string) => (await leer((tx) => tx.select().from(deliveries).where(eq(deliveries.id, pedidoId))))[0];

it('una moza crea un delivery: pedido confirmado de origen delivery y reparto preparando', async () => {
  const { pedidoId, r } = await crearDelivery();
  expect(r.estado).toBe('aplicada');
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p).toMatchObject({ origen: 'delivery', estado: 'confirmado', sesionId: null });
  expect(await fila(pedidoId)).toMatchObject({
    pedidoId, clienteNombre: 'Juana Pérez', direccion: 'Av. Siempreviva 742', costoEnvio: 150000, pagaCon: 2000000, estado: 'preparando',
  });
});

it('sale, se cobra con el envío y se entrega', async () => {
  const { pedidoId } = await crearDelivery();
  expect((await estado(pedidoId, 'en_camino', 'Juan')).estado).toBe('aplicada');
  expect(await fila(pedidoId)).toMatchObject({ estado: 'en_camino', repartidor: 'Juan' });
  expect((await cobrar(pedidoId, 1150000)).estado).toBe('aplicada');
  expect((await estado(pedidoId, 'entregado')).estado).toBe('aplicada');
  const f = await fila(pedidoId);
  expect(f!.estado).toBe('entregado');
  expect(f!.entregadoEn).toBeInstanceOf(Date);
  expect(f!.repartidor).toBe('Juan');
});

it('no se entrega sin cobrar', async () => {
  const { pedidoId } = await crearDelivery();
  expect((await estado(pedidoId, 'entregado')).error!.codigo).toBe('CUENTA_PENDIENTE');
});

it('el reparto no retrocede ni se repite', async () => {
  const { pedidoId } = await crearDelivery();
  await estado(pedidoId, 'en_camino');
  expect((await estado(pedidoId, 'en_camino')).error!.codigo).toBe('ESTADO_INVALIDO');
  await cobrar(pedidoId, 1150000);
  await estado(pedidoId, 'entregado');
  expect((await estado(pedidoId, 'en_camino')).error!.codigo).toBe('ESTADO_INVALIDO');
  expect((await fila(pedidoId))!.estado).toBe('entregado');
});

it('un delivery anulado no cambia de estado', async () => {
  const { pedidoId } = await crearDelivery();
  await enviar(e.tokenEncargado, op('pedido.anular', { pedidoId, motivo: 'Cliente canceló' }));
  expect((await estado(pedidoId, 'en_camino')).error!.codigo).toBe('ESTADO_INVALIDO');
});

it('datos del cliente inválidos se rechazan y el texto se limpia de controles', async () => {
  const { r } = await crearDelivery(e.tokenMoza, { cliente: { ...cliente, direccion: '' } });
  expect(r.error!.codigo).toBe('DATOS_INVALIDOS');
  const { pedidoId } = await crearDelivery(e.tokenMoza, { cliente: { ...cliente, nombre: 'Ana\u001b@' } });
  expect((await fila(pedidoId))!.clienteNombre).toBe('Ana @');
});

it('el pull del salón trae los deliveries (completo e incremental) y otro local no los ve', async () => {
  const { pedidoId } = await crearDelivery();
  const completo = (await pedir(app, e.tokenMoza)('GET', '/sync/salon')).json();
  expect(completo.deliveries.map((d: { id: string }) => d.id)).toEqual([pedidoId]);
  await estado(pedidoId, 'en_camino', 'Juan');
  const incr = (await pedir(app, e.tokenMoza)('GET', `/sync/salon?desde=${encodeURIComponent(completo.cursor)}`)).json();
  expect(incr.deliveries).toEqual([expect.objectContaining({ id: pedidoId, estado: 'en_camino' })]);
  const otro = await conLocal(dbs.dbApp, e.otroLocalId, (tx) => tx.select().from(deliveries));
  expect(otro).toEqual([]);
});
