import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
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

it('sin desde trae todo, incluidos borrados, sin localId', async () => {
  const cat = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas', horario: { desde: '20:00', hasta: '02:00' } })).json();
  const p = (await enc('POST', '/carta/productos', { categoriaId: cat.id, nombre: 'Muzza', precio: 1000 })).json();
  const borrado = (await enc('POST', '/carta/productos', { categoriaId: cat.id, nombre: 'Vieja', precio: 1 })).json();
  await enc('DELETE', `/carta/productos/${borrado.id}`);
  const g = (await enc('POST', `/carta/productos/${p.id}/grupos`, { nombre: 'Tamaño', min: 1, max: 1 })).json();
  await enc('POST', `/carta/grupos/${g.id}/opciones`, { nombre: 'Grande', recargo: 100 });

  const r = await pedir(app, e.tokenMoza)('GET', '/sync/carta');
  expect(r.statusCode).toBe(200);
  const d = r.json();
  expect(typeof d.cursor).toBe('string');
  expect(d.categorias[0]).toMatchObject({ id: cat.id, nombre: 'Pizzas', horarioDesde: '20:00', horarioHasta: '02:00', eliminadoEn: null });
  expect(d.productos.map((x: { nombre: string }) => x.nombre).sort()).toEqual(['Muzza', 'Vieja']);
  expect(d.productos.find((x: { nombre: string }) => x.nombre === 'Vieja').eliminadoEn).toMatch(/^\d{4}-/);
  expect(d.grupos[0]).toMatchObject({ productoId: p.id, nombre: 'Tamaño' });
  expect(d.opciones[0]).toMatchObject({ grupoId: g.id, recargo: 100 });
  expect(JSON.stringify(d)).not.toMatch(/localId/);
});

it('con desde trae solo lo cambiado (con solape de 30 s)', async () => {
  const cat = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json();
  const p = (await enc('POST', '/carta/productos', { categoriaId: cat.id, nombre: 'Muzza', precio: 1000 })).json();
  // envejecer todo 2 minutos para salir de la ventana de solape
  const viejo = new Date(Date.now() - 120_000);
  await dbs.dbAdmin.update(categorias).set({ actualizadoEn: viejo });
  await dbs.dbAdmin.update(productos).set({ actualizadoEn: viejo });
  const cursor = new Date(Date.now() - 90_000).toISOString();
  await enc('PATCH', `/carta/productos/${p.id}`, { precio: 2000 });
  const d = (await enc('GET', `/sync/carta?desde=${encodeURIComponent(cursor)}`)).json();
  expect(d.categorias).toEqual([]);
  expect(d.productos.map((x: { precio: number }) => x.precio)).toEqual([2000]);
});

it('nunca trae filas de otro local', async () => {
  const ajena = nuevoId();
  await dbs.dbAdmin.insert(categorias).values({ id: ajena, localId: e.otroLocalId, nombre: 'Ajena' });
  const d = (await enc('GET', '/sync/carta')).json();
  expect(d.categorias).toEqual([]);
  expect(await dbs.dbAdmin.select().from(categorias).where(eq(categorias.id, ajena))).toHaveLength(1);
});

it('desde inválido responde 400', async () => {
  expect((await enc('GET', '/sync/carta?desde=ayer')).statusCode).toBe(400);
});
