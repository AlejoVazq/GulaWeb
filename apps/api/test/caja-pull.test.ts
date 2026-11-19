import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { cobros, movimientosCaja, pagos, turnosCaja } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { mesaDePrueba } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);
const pull = async (desde?: string) =>
  (await pedir(app, e.tokenMoza)('GET', `/sync/caja${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`)).json();

it('sin desde trae la caja abierta y no una cerrada hace dos días', async () => {
  const vieja = nuevoId();
  const abierta = nuevoId();
  const haceDosDias = new Date(Date.now() - 2 * 86_400_000);
  await leer(async (tx) => {
    await tx.insert(turnosCaja).values({
      id: vieja, localId: e.localId, abiertoPor: e.encId, fondo: 0, abiertoEn: haceDosDias, cerradoEn: haceDosDias, cerradoPor: e.encId,
      contado: 0, esperado: 0, diferencia: 0,
    });
    await tx.insert(turnosCaja).values({ id: abierta, localId: e.localId, abiertoPor: e.encId, fondo: 500000 });
    await tx.insert(movimientosCaja).values({
      id: nuevoId(), localId: e.localId, turnoId: abierta, tipo: 'egreso', categoria: 'otro', monto: 100, motivo: 'x', usuarioId: e.encId,
    });
  });
  const r = await pull();
  expect(r.turnos.map((t: { id: string }) => t.id)).toEqual([abierta]);
  expect(r.movimientos).toHaveLength(1);
  expect(r.turnos[0].localId).toBeUndefined();
  expect(r.cursor).toBeTruthy();
});

it('con desde trae un pago nuevo', async () => {
  const turnoId = nuevoId();
  await leer((tx) => tx.insert(turnosCaja).values({ id: turnoId, localId: e.localId, abiertoPor: e.encId, fondo: 0 }));
  const { cursor } = await pull();
  const mesa = await mesaDePrueba(e.localId);
  const cobroId = nuevoId();
  await leer(async (tx) => {
    await tx.insert(cobros).values({ id: cobroId, localId: e.localId, turnoId, sesionId: mesa.sesionId, subtotal: 100, total: 100, cobradoPor: e.encId });
    await tx.insert(pagos).values({ id: nuevoId(), localId: e.localId, cobroId, turnoId, metodo: 'debito', monto: 100 });
  });
  const r = await pull(cursor);
  expect(r.cobros.map((c: { id: string }) => c.id)).toEqual([cobroId]);
  expect(r.pagos).toHaveLength(1);
});
