import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { itemsPedido, pedidos, sesionesMesa } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { cartaChica, mesaDePrueba, type CartaChica } from './salon.js';

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

const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);
const pull = async (desde?: string) =>
  (
    await pedir(app, e.tokenMoza)(
      'GET',
      `/sync/salon${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`,
    )
  ).json();

async function pedidoEn(mesa: { id: string; sesionId: string | null }) {
  const id = nuevoId();
  await leer(async (tx) => {
    await tx
      .insert(pedidos)
      .values({
        id,
        localId: e.localId,
        origen: 'qr',
        estado: 'pendiente',
        sesionId: mesa.sesionId,
        mesaId: mesa.id,
      });
    await tx.insert(itemsPedido).values({
      id: nuevoId(),
      localId: e.localId,
      pedidoId: id,
      productoId: c.hamburguesa,
      nombre: 'Hamburguesa',
      precioUnitario: 500000,
      cantidad: 1,
    });
  });
  return id;
}

it('sin desde trae las mesas y lo abierto, pero no lo cerrado hace más de 24 h', async () => {
  const abierta = await mesaDePrueba(e.localId, 'Mesa 1');
  const vieja = await mesaDePrueba(e.localId, 'Mesa 2');
  const reciente = await mesaDePrueba(e.localId, 'Mesa 3');
  const pAbierta = await pedidoEn(abierta);
  const pVieja = await pedidoEn(vieja);
  await leer(async (tx) => {
    await tx
      .update(sesionesMesa)
      .set({ estado: 'cerrada', cerradaEn: new Date(Date.now() - 25 * 3_600_000) })
      .where(eq(sesionesMesa.id, vieja.sesionId!));
    await tx
      .update(sesionesMesa)
      .set({ estado: 'cerrada', cerradaEn: new Date(Date.now() - 3_600_000) })
      .where(eq(sesionesMesa.id, reciente.sesionId!));
  });

  const d = await pull();
  expect(typeof d.cursor).toBe('string');
  expect(d.mesas.map((m: { nombre: string }) => m.nombre).sort()).toEqual([
    'Mesa 1',
    'Mesa 2',
    'Mesa 3',
  ]);
  expect(d.mesas[0].token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(d.sesiones.map((s: { id: string }) => s.id).sort()).toEqual(
    [abierta.sesionId, reciente.sesionId].sort(),
  );
  expect(d.pedidos.map((p: { id: string }) => p.id)).toEqual([pAbierta]);
  expect(d.items).toHaveLength(1);
  expect(d.items[0].pedidoId).toBe(pAbierta);
  expect(d.pedidos.map((p: { id: string }) => p.id)).not.toContain(pVieja);
  expect(d.avisos).toEqual([]);
  expect(JSON.stringify(d)).not.toMatch(/localId/);
});

it('con desde trae un pedido QR nuevo y su ítem', async () => {
  const m = await mesaDePrueba(e.localId);
  const primero = await pull();
  const id = await pedidoEn(m);
  const d = await pull(primero.cursor);
  expect(d.pedidos.map((p: { id: string }) => p.id)).toEqual([id]);
  expect(d.items).toHaveLength(1);
  expect(d.pedidos[0]).toMatchObject({ origen: 'qr', estado: 'pendiente', mesaId: m.id });
});

it('incluye los pedidos de mostrador de las últimas 24 h', async () => {
  const id = nuevoId();
  await leer((tx) =>
    tx
      .insert(pedidos)
      .values({
        id,
        localId: e.localId,
        origen: 'mostrador',
        estado: 'confirmado',
        numero: 1,
        dia: '2026-11-18',
      }),
  );
  expect((await pull()).pedidos.map((p: { id: string }) => p.id)).toEqual([id]);
});
