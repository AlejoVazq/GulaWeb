import { it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { mesas, sesionesMesa } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
beforeAll(async () => {
  app = await appDePrueba();
});
beforeEach(async () => {
  await limpiarDb();
  e = await escenario(app);
});
afterAll(async () => {
  await app.close();
  await dbs.cerrar();
});

it('crear tres mesas da tokens base64url distintos de 22 caracteres y su URL pública', async () => {
  const d = pedir(app, e.tokenDueno);
  const creadas = [];
  for (const nombre of ['Mesa 1', 'Mesa 2', 'Mesa 3']) {
    const r = await d('POST', '/salon/mesas', { nombre, zona: 'Salón' });
    expect(r.statusCode).toBe(201);
    creadas.push(r.json());
  }
  const tokens = creadas.map((m) => m.token as string);
  expect(new Set(tokens).size).toBe(3);
  for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(creadas[0].url).toBe(`/local-a/m/${tokens[0]}`);

  const lista = (await d('GET', '/salon/mesas')).json();
  expect(lista.map((m: { nombre: string }) => m.nombre)).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 3']);
});

it('regenerar el token lo cambia', async () => {
  const d = pedir(app, e.tokenDueno);
  const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 1' })).json();
  const r = await d('POST', `/salon/mesas/${m.id}/regenerar-token`);
  expect(r.statusCode).toBe(200);
  expect(r.json().token).not.toBe(m.token);
  expect(r.json().token).toMatch(/^[A-Za-z0-9_-]{22}$/);
});

it('editar una mesa cambia nombre, zona y capacidad', async () => {
  const d = pedir(app, e.tokenDueno);
  const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 1' })).json();
  const r = await d('PATCH', `/salon/mesas/${m.id}`, { nombre: 'Mesa 10', zona: 'Vereda', capacidad: 4 });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ nombre: 'Mesa 10', zona: 'Vereda', capacidad: 4, token: m.token });
});

it('no se borra una mesa con sesión abierta', async () => {
  const d = pedir(app, e.tokenDueno);
  const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 1' })).json();
  await conLocal(dbs.dbApp, e.localId, (tx) =>
    tx.insert(sesionesMesa).values({ id: nuevoId(), localId: e.localId, mesaId: m.id, estado: 'abierta' }),
  );
  const r = await d('DELETE', `/salon/mesas/${m.id}`);
  expect(r.statusCode).toBe(409);
  expect(r.json().error.codigo).toBe('MESA_OCUPADA');
});

it('borrar una mesa libre la saca de la lista', async () => {
  const d = pedir(app, e.tokenDueno);
  const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 1' })).json();
  expect((await d('DELETE', `/salon/mesas/${m.id}`)).statusCode).toBe(204);
  expect((await d('GET', '/salon/mesas')).json()).toEqual([]);
});

it('la base no permite dos sesiones no cerradas en la misma mesa', async () => {
  const d = pedir(app, e.tokenDueno);
  const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 1' })).json();
  const abrir = () =>
    conLocal(dbs.dbApp, e.localId, (tx) =>
      tx.insert(sesionesMesa).values({ id: nuevoId(), localId: e.localId, mesaId: m.id, estado: 'abierta' }),
    );
  await abrir();
  await expect(abrir()).rejects.toThrow();
});

it('una moza no administra mesas', async () => {
  const r = await pedir(app, e.tokenMoza)('POST', '/salon/mesas', { nombre: 'Mesa 1' });
  expect(r.statusCode).toBe(403);
});

it('las mesas de otro local son invisibles', async () => {
  await pedir(app, e.tokenDueno)('POST', '/salon/mesas', { nombre: 'Mesa 1' });
  const filas = await conLocal(dbs.dbApp, e.otroLocalId, (tx) => tx.select().from(mesas));
  expect(filas).toEqual([]);
});
