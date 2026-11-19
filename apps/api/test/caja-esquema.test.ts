import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { cobros, turnosCaja } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const turno = (localId: string) => ({ id: nuevoId(), localId, abiertoPor: e.encId, fondo: 1000000 });

it('no puede haber dos cajas abiertas en el mismo local', async () => {
  await conLocal(dbs.dbApp, e.localId, (tx) => tx.insert(turnosCaja).values(turno(e.localId)));
  await expect(conLocal(dbs.dbApp, e.localId, (tx) => tx.insert(turnosCaja).values(turno(e.localId)))).rejects.toThrow();
});

it('un cobro tiene que ser de una mesa o de un pedido', async () => {
  const t = turno(e.localId);
  await conLocal(dbs.dbApp, e.localId, (tx) => tx.insert(turnosCaja).values(t));
  await expect(
    conLocal(dbs.dbApp, e.localId, (tx) =>
      tx.insert(cobros).values({ id: nuevoId(), localId: e.localId, turnoId: t.id, subtotal: 100, descuento: 0, total: 100, cobradoPor: e.encId }),
    ),
  ).rejects.toThrow();
});

it('las cajas de otro local no se ven', async () => {
  await conLocal(dbs.dbApp, e.localId, (tx) => tx.insert(turnosCaja).values(turno(e.localId)));
  expect(await conLocal(dbs.dbApp, e.otroLocalId, (tx) => tx.select().from(turnosCaja))).toHaveLength(0);
});

it('autorizar con el PIN del encargado no cambia el usuario de la PC', async () => {
  const r = await pedir(app, e.tokenMoza)('POST', '/auth/autorizar', { usuarioId: e.encId, pin: '5555', accion: 'pedido.anular' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ usuario: { id: e.encId, rol: 'encargado' } });
  const yo = await pedir(app, e.tokenMoza)('GET', '/auth/yo');
  expect(yo.json()).toMatchObject({ usuario: { id: e.mozaId } });
});

it('el PIN de una moza no autoriza una anulación', async () => {
  const r = await pedir(app, e.tokenMoza)('POST', '/auth/autorizar', { usuarioId: e.mozaId, pin: '4321', accion: 'pedido.anular' });
  expect(r.statusCode).toBe(403);
  expect(r.json().error.codigo).toBe('REQUIERE_AUTORIZACION');
});

it('un PIN incorrecto no autoriza', async () => {
  const r = await pedir(app, e.tokenMoza)('POST', '/auth/autorizar', { usuarioId: e.encId, pin: '0000', accion: 'pedido.anular' });
  expect(r.statusCode).toBe(403);
});
