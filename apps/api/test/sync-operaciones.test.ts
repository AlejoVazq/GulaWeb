import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { auditoria, categorias, productos } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let productoId: string;
let opcionId: string;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  const enc = pedir(app, e.tokenEncargado);
  const cat = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json();
  productoId = (await enc('POST', '/carta/productos', { categoriaId: cat.id, nombre: 'Muzza', precio: 1000 })).json().id;
  const g = (await enc('POST', `/carta/productos/${productoId}/grupos`, { nombre: 'Extras', min: 0, max: 1 })).json();
  opcionId = (await enc('POST', `/carta/grupos/${g.id}/opciones`, { nombre: 'Huevo' })).json().id;
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const op = (tipo: string, datos: unknown, id = nuevoId()) => ({ id, tipo, datos, creadaEn: new Date().toISOString() });
const enviar = (token: string, operaciones: unknown[]) =>
  pedir(app, token)('POST', '/sync/operaciones', { operaciones });

it('la misma operación dos veces se aplica una sola vez', async () => {
  const o = op('producto.disponibilidad', { productoId, disponible: false });
  const r1 = await enviar(e.tokenMoza, [o]);
  const r2 = await enviar(e.tokenMoza, [o]);
  expect(r1.json()).toEqual({ resultados: [{ id: o.id, estado: 'aplicada' }] });
  expect(r2.json()).toEqual(r1.json());
  const filas = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'producto.disponibilidad'));
  expect(filas).toHaveLength(1);
  const [p] = await dbs.dbAdmin.select().from(productos).where(eq(productos.id, productoId));
  expect(p!.disponible).toBe(false);
});

it('tipo desconocido queda rechazado y el reintento devuelve lo mismo', async () => {
  const o = op('nave.despegar', {});
  const r1 = (await enviar(e.tokenMoza, [o])).json();
  expect(r1.resultados[0]).toMatchObject({ estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS' } });
  expect((await enviar(e.tokenMoza, [o])).json()).toEqual(r1);
});

it('producto de otro local queda rechazado NO_ENCONTRADO', async () => {
  const cat = nuevoId();
  const ajeno = nuevoId();
  await dbs.dbAdmin.insert(categorias).values({ id: cat, localId: e.otroLocalId, nombre: 'X' });
  await dbs.dbAdmin.insert(productos).values({ id: ajeno, localId: e.otroLocalId, categoriaId: cat, nombre: 'Ajeno', precio: 1 });
  const r = (await enviar(e.tokenMoza, [op('producto.disponibilidad', { productoId: ajeno, disponible: false })])).json();
  expect(r.resultados[0]).toMatchObject({ estado: 'rechazada', error: { codigo: 'NO_ENCONTRADO' } });
});

it('en un lote, la válida se aplica aunque otra falle', async () => {
  const buena = op('opcion.disponibilidad', { opcionId, disponible: false });
  const mala = op('producto.disponibilidad', { productoId: 'no-uuid', disponible: false });
  const r = (await enviar(e.tokenMoza, [mala, buena])).json();
  expect(r.resultados.map((x: { estado: string }) => x.estado)).toEqual(['rechazada', 'aplicada']);
});

it('respeta permisos del usuario de la sesión', async () => {
  // registra un tipo de prueba que exige caja.operar (la moza no puede)
  const { registrarTipoOperacion } = await import('../src/sync/operaciones.js');
  const { z } = await import('zod');
  registrarTipoOperacion('prueba.caja', { permiso: 'caja.operar', esquema: z.object({}), aplicar: async () => {} });
  const r = (await enviar(e.tokenMoza, [op('prueba.caja', {})])).json();
  expect(r.resultados[0]).toMatchObject({ estado: 'rechazada', error: { codigo: 'SIN_PERMISO' } });
});

it('más de 100 operaciones responde 400', async () => {
  const muchas = Array.from({ length: 101 }, () => op('producto.disponibilidad', { productoId, disponible: true }));
  expect((await enviar(e.tokenMoza, muchas)).statusCode).toBe(400);
});

it('la operación se atribuye al usuario que la hizo en la PC, no al de la sesión al enviar', async () => {
  const [moza] = (await pedir(app, e.tokenDueno)('GET', '/usuarios')).json().filter((u: { rol: string }) => u.rol === 'mesero');
  const o = { ...op('producto.disponibilidad', { productoId, disponible: false }), usuarioId: moza.id };
  const r = (await enviar(e.tokenDueno, [o])).json();
  expect(r.resultados[0].estado).toBe('aplicada');
  const [a] = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'producto.disponibilidad'));
  expect(a!.usuarioId).toBe(moza.id);
});

it('usuario de la operación inexistente en el local la rechaza', async () => {
  const o = { ...op('producto.disponibilidad', { productoId, disponible: false }), usuarioId: nuevoId() };
  const r = (await enviar(e.tokenDueno, [o])).json();
  expect(r.resultados[0]).toMatchObject({ estado: 'rechazada', error: { codigo: 'NO_ENCONTRADO' } });
});

it('los permisos se evalúan con el usuario de la operación', async () => {
  const { registrarTipoOperacion } = await import('../src/sync/operaciones.js');
  const { z } = await import('zod');
  registrarTipoOperacion('prueba.caja2', { permiso: 'caja.operar', esquema: z.object({}), aplicar: async () => {} });
  const [moza] = (await pedir(app, e.tokenDueno)('GET', '/usuarios')).json().filter((u: { rol: string }) => u.rol === 'mesero');
  const r = (await enviar(e.tokenDueno, [{ ...op('prueba.caja2', {}), usuarioId: moza.id }])).json();
  expect(r.resultados[0]).toMatchObject({ estado: 'rechazada', error: { codigo: 'SIN_PERMISO' } });
});
