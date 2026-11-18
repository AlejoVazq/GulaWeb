import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId } from '@gula/shared';
import { categorias, productos } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let enc: ReturnType<typeof pedir>;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  enc = pedir(app, e.tokenEncargado);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

it('mesero no puede editar la carta', async () => {
  const r = await pedir(app, e.tokenMoza)('POST', '/carta/categorias', { nombre: 'Tragos' });
  expect(r.statusCode).toBe(403);
});
it('crea categoría con horario que cruza medianoche y la lee igual', async () => {
  const r = await enc('POST', '/carta/categorias', { nombre: 'Trasnoche', horario: { desde: '20:00', hasta: '02:00' } });
  expect(r.statusCode).toBe(201);
  const lista = (await enc('GET', '/carta/categorias')).json();
  expect(lista).toEqual([
    expect.objectContaining({ nombre: 'Trasnoche', horario: { desde: '20:00', hasta: '02:00' }, visible: true }),
  ]);
  expect(lista[0]).not.toHaveProperty('localId');
});
it('horario inválido responde 400', async () => {
  const r = await enc('POST', '/carta/categorias', { nombre: 'X', horario: { desde: '25:00', hasta: '02:00' } });
  expect(r.statusCode).toBe(400);
});
it('reordena categorías', async () => {
  const ids = [];
  for (const nombre of ['A', 'B', 'C']) ids.push((await enc('POST', '/carta/categorias', { nombre })).json().id);
  expect((await enc('PUT', '/carta/categorias/orden', { ids: [ids[2], ids[0], ids[1]] })).statusCode).toBe(204);
  expect((await enc('GET', '/carta/categorias')).json().map((c: { nombre: string }) => c.nombre)).toEqual(['C', 'A', 'B']);
});
it('no se borra una categoría con productos; borrada no aparece', async () => {
  const cat = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json();
  await dbs.dbAdmin.insert(productos).values({ id: nuevoId(), localId: e.localId, categoriaId: cat.id, nombre: 'Muzza', precio: 1000 });
  const r = await enc('DELETE', `/carta/categorias/${cat.id}`);
  expect(r.json().error.codigo).toBe('CATEGORIA_CON_PRODUCTOS');
  const vacia = (await enc('POST', '/carta/categorias', { nombre: 'Vacía' })).json();
  expect((await enc('DELETE', `/carta/categorias/${vacia.id}`)).statusCode).toBe(204);
  expect((await enc('GET', '/carta/categorias')).json().map((c: { nombre: string }) => c.nombre)).toEqual(['Pizzas']);
});
it('categoría de otro local responde 404', async () => {
  const id = nuevoId();
  await dbs.dbAdmin.insert(categorias).values({ id, localId: e.otroLocalId, nombre: 'Ajena' });
  expect((await enc('PATCH', `/carta/categorias/${id}`, { nombre: 'Mía' })).statusCode).toBe(404);
});
it('sectores: crea, edita y borra', async () => {
  const s = (await enc('POST', '/carta/sectores', { nombre: 'Cocina' })).json();
  expect((await enc('PATCH', `/carta/sectores/${s.id}`, { nombre: 'Cocina caliente' })).json().nombre).toBe('Cocina caliente');
  expect((await enc('DELETE', `/carta/sectores/${s.id}`)).statusCode).toBe(204);
  expect((await enc('GET', '/carta/sectores')).json()).toEqual([]);
});
