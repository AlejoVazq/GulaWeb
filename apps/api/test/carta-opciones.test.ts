import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let enc: ReturnType<typeof pedir>;
let productoId: string;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  enc = pedir(app, e.tokenEncargado);
  const categoriaId = (await enc('POST', '/carta/categorias', { nombre: 'Burgers' })).json().id;
  productoId = (await enc('POST', '/carta/productos', { categoriaId, nombre: 'Clásica', precio: 900000 })).json().id;
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

it('min mayor que max responde 400', async () => {
  const r = await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Tamaño', min: 2, max: 1 });
  expect(r.statusCode).toBe(400);
});
it('recargo negativo responde 400', async () => {
  const g = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Extras', min: 0, max: 3 })).json();
  expect((await enc('POST', `/carta/grupos/${g.id}/opciones`, { nombre: 'Bacon', recargo: -5 })).statusCode).toBe(400);
});
it('GET del producto trae grupos y opciones en orden, sin borrados', async () => {
  const tam = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Tamaño', min: 1, max: 1 })).json();
  const ext = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Extras', min: 0, max: 2 })).json();
  await enc('POST', `/carta/grupos/${tam.id}/opciones`, { nombre: 'Simple' });
  await enc('POST', `/carta/grupos/${tam.id}/opciones`, { nombre: 'Doble', recargo: 300000 });
  const bacon = (await enc('POST', `/carta/grupos/${ext.id}/opciones`, { nombre: 'Bacon', recargo: 100000 })).json();
  await enc('POST', `/carta/grupos/${ext.id}/opciones`, { nombre: 'Cheddar', recargo: 80000 });
  expect((await enc('DELETE', `/carta/opciones/${bacon.id}`)).statusCode).toBe(204);
  const p = (await enc('GET', `/carta/productos/${productoId}`)).json();
  expect(p.grupos.map((g: { nombre: string }) => g.nombre)).toEqual(['Tamaño', 'Extras']);
  expect(p.grupos[0].opciones.map((o: { nombre: string; recargo: number }) => [o.nombre, o.recargo])).toEqual([
    ['Simple', 0],
    ['Doble', 300000],
  ]);
  expect(p.grupos[1].opciones.map((o: { nombre: string }) => o.nombre)).toEqual(['Cheddar']);
});
it('la moza cambia disponibilidad de una opción', async () => {
  const g = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Extras', min: 0, max: 1 })).json();
  const o = (await enc('POST', `/carta/grupos/${g.id}/opciones`, { nombre: 'Huevo' })).json();
  const r = await pedir(app, e.tokenMoza)('PATCH', `/carta/opciones/${o.id}/disponibilidad`, { disponible: false });
  expect(r.statusCode).toBe(200);
  expect(r.json().disponible).toBe(false);
});
it('editar grupo valida min/max contra lo guardado', async () => {
  const g = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Salsas', min: 0, max: 2 })).json();
  expect((await enc('PATCH', `/carta/grupos/${g.id}`, { min: 3 })).statusCode).toBe(400);
  expect((await enc('PATCH', `/carta/grupos/${g.id}`, { min: 1 })).json().min).toBe(1);
});
