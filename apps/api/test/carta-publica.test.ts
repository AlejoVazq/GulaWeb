import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId, type CartaPublica } from '@gula/shared';
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

const carta = async (slug = 'local-a') => app.inject({ method: 'GET', url: `/publico/locales/${slug}/carta` });

it('arma la carta pública filtrando ocultos, borrados y ajenos', async () => {
  const pizzas = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json();
  const oculta = (await enc('POST', '/carta/categorias', { nombre: 'Oculta', visible: false })).json();
  await enc('POST', '/carta/categorias', { nombre: 'Vacía' });
  const muzza = (await enc('POST', '/carta/productos', { categoriaId: pizzas.id, nombre: 'Muzza', precio: 1000000 })).json();
  await enc('POST', '/carta/productos', { categoriaId: pizzas.id, nombre: 'Secreta', precio: 1, visible: false });
  const borrada = (await enc('POST', '/carta/productos', { categoriaId: pizzas.id, nombre: 'Borrada', precio: 1 })).json();
  await enc('DELETE', `/carta/productos/${borrada.id}`);
  const fuga = (await enc('POST', '/carta/productos', { categoriaId: pizzas.id, nombre: 'Fugazzeta', precio: 1100000 })).json();
  await enc('PATCH', `/carta/productos/${fuga.id}/disponibilidad`, { disponible: false });
  await enc('POST', '/carta/productos', { categoriaId: oculta.id, nombre: 'En oculta', precio: 1 });
  const g = (await enc('POST', `/carta/productos/${muzza.id}/grupos`, { nombre: 'Tamaño', min: 1, max: 1 })).json();
  await enc('POST', `/carta/grupos/${g.id}/opciones`, { nombre: 'Grande', recargo: 200000 });
  // producto de otro local en una categoría ajena
  const ajena = nuevoId();
  await dbs.dbAdmin.insert(categorias).values({ id: ajena, localId: e.otroLocalId, nombre: 'Ajena' });
  await dbs.dbAdmin.insert(productos).values({ id: nuevoId(), localId: e.otroLocalId, categoriaId: ajena, nombre: 'Ajeno', precio: 1 });

  const r = await carta();
  expect(r.statusCode).toBe(200);
  expect(r.headers['cache-control']).toBe('public, max-age=30');
  const c = r.json() as CartaPublica;
  expect(c.local).toMatchObject({ nombre: 'Local local-a', slug: 'local-a' });
  expect(c.categorias.map((x) => x.nombre)).toEqual(['Pizzas']);
  const ps = c.categorias[0]!.productos;
  expect(ps.map((p) => [p.nombre, p.disponible])).toEqual([
    ['Muzza', true],
    ['Fugazzeta', false],
  ]);
  expect(ps[0]!.grupos[0]).toMatchObject({ nombre: 'Tamaño', min: 1, max: 1, opciones: [{ nombre: 'Grande', recargo: 200000 }] });
  expect(c.categorias[0]!.enHorario).toBe(true);
  expect(JSON.stringify(c)).not.toMatch(/localId|eliminado/);
});
it('slug inexistente responde 404 LOCAL_NO_ENCONTRADO', async () => {
  const r = await carta('no-existe');
  expect(r.statusCode).toBe(404);
  expect(r.json().error.codigo).toBe('LOCAL_NO_ENCONTRADO');
});
it('informa el horario de la categoría', async () => {
  const d = (await enc('POST', '/carta/categorias', { nombre: 'Desayunos', horario: { desde: '08:00', hasta: '12:00' } })).json();
  await enc('POST', '/carta/productos', { categoriaId: d.id, nombre: 'Café con leche', precio: 300000 });
  const c = (await carta()).json() as CartaPublica;
  expect(c.categorias[0]!.horario).toEqual({ desde: '08:00', hasta: '12:00' });
  expect(typeof c.categorias[0]!.enHorario).toBe('boolean');
});
