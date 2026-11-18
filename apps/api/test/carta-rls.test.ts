import { it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { categorias, productos } from '../src/db/schema/index.js';
import { conLocal } from '../src/db/conLocal.js';
import { crearLocalDePrueba, dbs, limpiarDb } from './db.js';

const { dbApp } = dbs;
beforeEach(limpiarDb);
afterAll(() => dbs.cerrar());

async function productoEn(localId: string) {
  return conLocal(dbApp, localId, async (tx) => {
    const categoriaId = nuevoId();
    await tx.insert(categorias).values({ id: categoriaId, localId, nombre: 'Bebidas' });
    const [p] = await tx
      .insert(productos)
      .values({ id: nuevoId(), localId, categoriaId, nombre: 'Agua', precio: 150000 })
      .returning();
    return p!;
  });
}

it('un local no ve productos de otro', async () => {
  const a = await crearLocalDePrueba('local-a');
  const b = await crearLocalDePrueba('local-b');
  await productoEn(b.localId);
  const filas = await conLocal(dbApp, a.localId, (tx) => tx.select().from(productos));
  expect(filas).toEqual([]);
});

it('actualizado_en cambia en cada UPDATE', async () => {
  const a = await crearLocalDePrueba('local-a');
  const p = await productoEn(a.localId);
  await new Promise((r) => setTimeout(r, 20));
  const [despues] = await conLocal(dbApp, a.localId, (tx) =>
    tx.update(productos).set({ precio: 1 }).where(eq(productos.id, p.id)).returning(),
  );
  expect(despues!.actualizadoEn.getTime()).toBeGreaterThan(p.actualizadoEn.getTime());
});

it('precio negativo es rechazado por la base', async () => {
  const a = await crearLocalDePrueba('local-a');
  const p = await productoEn(a.localId);
  await expect(
    conLocal(dbApp, a.localId, (tx) => tx.update(productos).set({ precio: -1 }).where(eq(productos.id, p.id))),
  ).rejects.toThrow();
});
