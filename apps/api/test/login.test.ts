import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appDePrueba, credenciales, localConDueno, login, refresh } from './app.js';
import { eq } from 'drizzle-orm';
import { dbs, limpiarDb } from './db.js';
import { locales } from '../src/db/schema/index.js';

let app: FastifyInstance;
beforeEach(async () => {
  await limpiarDb();
  await localConDueno('local-a');
  app = await appDePrueba();
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

it('login exitoso devuelve tokens y datos', async () => {
  const r = await login(app, credenciales);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ usuario: { rol: 'dueno' }, local: { slug: 'local-a' } });
  expect(typeof r.json().accessToken).toBe('string');
  expect(typeof r.json().refreshToken).toBe('string');
});
it('acepta email con mayúsculas y espacios', async () => {
  expect((await login(app, { email: ' DUENO@local.com', password: 'secreto123' })).statusCode).toBe(200);
});
it('password mala y email inexistente responden igual', async () => {
  const a = await login(app, { email: 'dueno@local.com', password: 'mal-password' });
  const b = await login(app, { email: 'nadie@local.com', password: 'mal-password' });
  expect(a.statusCode).toBe(401);
  expect(a.json()).toEqual(b.json());
  expect(a.json().error.codigo).toBe('CREDENCIALES_INVALIDAS');
});
it('un segundo login desactiva el dispositivo anterior', async () => {
  const primero = (await login(app, credenciales)).json();
  await login(app, credenciales);
  expect((await refresh(app, primero.refreshToken)).statusCode).toBe(401);
});
it('limita a 10 intentos por minuto', async () => {
  const limitada = await appDePrueba({ rateLimitAuth: 10 });
  for (let i = 0; i < 10; i++) await login(limitada, { email: 'x@x.com', password: 'mal-password' });
  const r = await login(limitada, { email: 'x@x.com', password: 'mal-password' });
  expect(r.statusCode).toBe(429);
  expect(r.json().error.codigo).toBe('DEMASIADOS_INTENTOS');
  await limitada.close();
});
it('login devuelve el logo de la marca del local, o null', async () => {
  expect((await login(app, credenciales)).json().local.logo).toBeNull();
  await dbs.dbAdmin.update(locales).set({ marca: { logo: '/marcas/gula-hoja.svg' } }).where(eq(locales.slug, 'local-a'));
  expect((await login(app, credenciales)).json().local.logo).toBe('/marcas/gula-hoja.svg');
});
