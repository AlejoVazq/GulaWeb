import { it, expect, beforeEach, afterAll } from 'vitest';
import { validarSeleccion, type Seleccion } from '@gula/shared';
import { cargarCartaDemo } from '../src/admin/seedDemo.js';
import { armarCartaPublica } from '../src/carta/publica.js';
import { localConDueno } from './app.js';
import { dbs, limpiarDb } from './db.js';

beforeEach(limpiarDb);
afterAll(() => dbs.cerrar());

it('carga una carta demo completa y válida', async () => {
  const { localId } = await localConDueno('demo');
  const r = await cargarCartaDemo(dbs, localId);
  expect(r.categorias).toBeGreaterThanOrEqual(6);
  expect(r.productos).toBeGreaterThanOrEqual(30);
  const carta = await armarCartaPublica(dbs, 'demo', new Date('2026-11-18T10:00:00-03:00'));
  expect(carta.categorias.length).toBeGreaterThanOrEqual(6);
  const todos = carta.categorias.flatMap((c) => c.productos);
  expect(todos.filter((p) => p.grupos.some((g) => g.min > 0)).length).toBeGreaterThanOrEqual(3);
  expect(todos.filter((p) => !p.disponible).length).toBe(2);
  expect(carta.categorias.find((c) => c.horario)?.horario).toEqual({ desde: '08:00', hasta: '12:00' });
  for (const p of todos) {
    const sel: Seleccion = {};
    for (const g of p.grupos) sel[g.id] = g.opciones.filter((o) => o.disponible).slice(0, g.min).map((o) => o.id);
    expect(validarSeleccion(p, sel)).toEqual({ ok: true });
  }
});
it('no carga dos veces', async () => {
  const { localId } = await localConDueno('demo');
  await cargarCartaDemo(dbs, localId);
  await expect(cargarCartaDemo(dbs, localId)).rejects.toMatchObject({ codigo: 'CARTA_NO_VACIA' });
});
