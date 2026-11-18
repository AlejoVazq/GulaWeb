import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { refreshTokens, usuarios } from '../src/db/schema/index.js';
import { sha256 } from '../src/seguridad/hash.js';
import { appDePrueba, bearer, credenciales, localConDueno, login, refresh } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
beforeEach(async () => {
  await limpiarDb();
  await localConDueno('local-a');
  app = await appDePrueba();
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

it('/auth/yo con token válido', async () => {
  const { accessToken } = (await login(app, credenciales)).json();
  const r = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(accessToken) });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ usuario: { rol: 'dueno' }, local: { slug: 'local-a' } });
});
it('sin token responde 401', async () => {
  const r = await app.inject({ method: 'GET', url: '/auth/yo' });
  expect(r.statusCode).toBe(401);
  expect(r.json().error.codigo).toBe('SESION_INVALIDA');
});
it('usuario desactivado pierde acceso en la siguiente request', async () => {
  const { accessToken, usuario } = (await login(app, credenciales)).json();
  await dbs.dbAdmin.update(usuarios).set({ activo: false }).where(eq(usuarios.id, usuario.id));
  const r = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(accessToken) });
  expect(r.statusCode).toBe(401);
});
it('refresh rota el token', async () => {
  const t0 = (await login(app, credenciales)).json().refreshToken;
  const r1 = await refresh(app, t0);
  expect(r1.statusCode).toBe(200);
  expect(r1.json().refreshToken).not.toBe(t0);
  expect(typeof r1.json().accessToken).toBe('string');
});
it('reusar un refresh revoca toda la familia', async () => {
  const t0 = (await login(app, credenciales)).json().refreshToken;
  const t1 = (await refresh(app, t0)).json().refreshToken;
  // pasado el margen de reintento, usar t0 otra vez es reuso
  await dbs.dbAdmin.update(refreshTokens).set({ usadoEn: new Date(Date.now() - 120_000) }).where(eq(refreshTokens.hash, sha256(t0)));
  const reuso = await refresh(app, t0);
  expect(reuso.statusCode).toBe(401);
  expect(reuso.json().error.codigo).toBe('TOKEN_REUTILIZADO');
  expect((await refresh(app, t1)).statusCode).toBe(401);
});
it('refresh inexistente o vencido responde 401', async () => {
  expect((await refresh(app, 'no-existe')).statusCode).toBe(401);
});
it('logout invalida el dispositivo', async () => {
  const { accessToken, refreshToken } = (await login(app, credenciales)).json();
  const r = await app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(accessToken) });
  expect(r.statusCode).toBe(204);
  expect((await refresh(app, refreshToken)).statusCode).toBe(401);
  const yo = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(accessToken) });
  expect(yo.statusCode).toBe(401);
});

it('reintento inmediato del mismo refresh (respuesta perdida) no cierra la sesión', async () => {
  const t0 = (await login(app, credenciales)).json().refreshToken;
  expect((await refresh(app, t0)).statusCode).toBe(200);
  const reintento = await refresh(app, t0);
  expect(reintento.statusCode).toBe(200);
  expect((await refresh(app, reintento.json().refreshToken)).statusCode).toBe(200);
});
