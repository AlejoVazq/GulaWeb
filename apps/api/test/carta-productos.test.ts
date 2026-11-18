import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { auditoria, categorias } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let enc: ReturnType<typeof pedir>;
let moza: ReturnType<typeof pedir>;
let categoriaId: string;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  enc = pedir(app, e.tokenEncargado);
  moza = pedir(app, e.tokenMoza);
  categoriaId = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json().id;
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const muzza = () => ({ categoriaId, nombre: 'Muzzarella', descripcion: 'Clásica', precio: 1200000, etiquetas: ['vegetariano'] });

it('crea y lista productos de una categoría', async () => {
  const r = await enc('POST', '/carta/productos', muzza());
  expect(r.statusCode).toBe(201);
  expect(r.json()).toMatchObject({ nombre: 'Muzzarella', precio: 1200000, disponible: true, etiquetas: ['vegetariano'] });
  const lista = (await enc('GET', `/carta/productos?categoriaId=${categoriaId}`)).json();
  expect(lista).toHaveLength(1);
});
it('precio negativo o con decimales responde 400', async () => {
  expect((await enc('POST', '/carta/productos', { ...muzza(), precio: -1 })).statusCode).toBe(400);
  expect((await enc('POST', '/carta/productos', { ...muzza(), precio: 1.5 })).statusCode).toBe(400);
});
it('la moza cambia disponibilidad pero no el precio', async () => {
  const p = (await enc('POST', '/carta/productos', muzza())).json();
  const r = await moza('PATCH', `/carta/productos/${p.id}/disponibilidad`, { disponible: false });
  expect(r.statusCode).toBe(200);
  expect(r.json().disponible).toBe(false);
  expect((await moza('PATCH', `/carta/productos/${p.id}`, { precio: 1 })).statusCode).toBe(403);
});
it('cambio de precio queda auditado con antes y después', async () => {
  const p = (await enc('POST', '/carta/productos', muzza())).json();
  await enc('PATCH', `/carta/productos/${p.id}`, { precio: 1350000 });
  const [a] = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'producto.precio'));
  expect(a).toMatchObject({ entidadId: p.id, antes: { precio: 1200000 }, despues: { precio: 1350000 } });
});
it('categoría de otro local responde 400', async () => {
  const ajena = nuevoId();
  await dbs.dbAdmin.insert(categorias).values({ id: ajena, localId: e.otroLocalId, nombre: 'Ajena' });
  const r = await enc('POST', '/carta/productos', { ...muzza(), categoriaId: ajena });
  expect(r.statusCode).toBe(400);
  expect(r.json().error.codigo).toBe('DATOS_INVALIDOS');
});
it('borrado lógico y reorden', async () => {
  const a = (await enc('POST', '/carta/productos', muzza())).json();
  const b = (await enc('POST', '/carta/productos', { ...muzza(), nombre: 'Fugazzeta' })).json();
  expect((await enc('PUT', '/carta/productos/orden', { categoriaId, ids: [b.id, a.id] })).statusCode).toBe(204);
  expect((await enc('GET', `/carta/productos?categoriaId=${categoriaId}`)).json().map((p: { nombre: string }) => p.nombre)).toEqual(['Fugazzeta', 'Muzzarella']);
  expect((await enc('DELETE', `/carta/productos/${a.id}`)).statusCode).toBe(204);
  expect((await enc('GET', `/carta/productos?categoriaId=${categoriaId}`)).json()).toHaveLength(1);
});

it('precio fuera de rango de la base responde 400, no 500', async () => {
  const p = (await enc('POST', '/carta/productos', muzza())).json();
  const r = await enc('PATCH', `/carta/productos/${p.id}`, { precio: 3_000_000_000 });
  expect(r.statusCode).toBe(400);
});
