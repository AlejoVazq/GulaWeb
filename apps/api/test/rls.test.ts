import { it, expect, beforeEach, afterAll } from 'vitest';
import { nuevoId } from '@gula/shared';
import { usuarios, dispositivos } from '../src/db/schema/index.js';
import { conLocal } from '../src/db/conLocal.js';
import { crearLocalDePrueba, dbs, limpiarDb } from './db.js';

const { dbApp } = dbs;
beforeEach(limpiarDb);
afterAll(() => dbs.cerrar());

it('un local solo ve sus usuarios', async () => {
  const a = await crearLocalDePrueba('local-a');
  await crearLocalDePrueba('local-b');
  const filas = await conLocal(dbApp, a.localId, (tx) => tx.select().from(usuarios));
  expect(filas.map((f) => f.localId)).toEqual([a.localId]);
});

it('sin app.local_id no se ve nada', async () => {
  await crearLocalDePrueba('local-a');
  expect(await dbApp.select().from(usuarios)).toEqual([]);
});

it('no se puede insertar en otro local', async () => {
  const a = await crearLocalDePrueba('local-a');
  const b = await crearLocalDePrueba('local-b');
  await expect(
    conLocal(dbApp, a.localId, (tx) =>
      tx.insert(dispositivos).values({ id: nuevoId(), localId: b.localId, nombre: 'PC' }),
    ),
  ).rejects.toSatisfy((e: unknown) => /row-level security/.test(String((e as { cause?: Error }).cause?.message)));
});
