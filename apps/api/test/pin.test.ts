import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { usuarios } from '../src/db/schema/index.js';
import {
  appDePrueba,
  bearer,
  credenciales,
  crearUsuarioDePrueba,
  localConDueno,
  login,
  pin,
} from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let token: string;
let mozaId: string;
let usuarioDeOtroLocal: string;

beforeEach(async () => {
  await limpiarDb();
  const a = await localConDueno('local-a');
  const b = await localConDueno('local-b', 'otro@local.com');
  mozaId = await crearUsuarioDePrueba(a.localId, { nombre: 'Moza Ana', rol: 'mesero', pin: '4321' });
  await crearUsuarioDePrueba(a.localId, { nombre: 'Baja', rol: 'mesero', pin: '9999' }).then((id) =>
    dbs.dbAdmin.update(usuarios).set({ activo: false }).where(eq(usuarios.id, id)),
  );
  usuarioDeOtroLocal = b.duenoId;
  app = await appDePrueba();
  token = (await login(app, credenciales)).json().accessToken;
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

it('lista usuarios activos del local', async () => {
  const r = await app.inject({ method: 'GET', url: '/auth/usuarios', headers: bearer(token) });
  expect(r.statusCode).toBe(200);
  expect(r.json().map((u: { nombre: string }) => u.nombre)).toEqual(['Dueño', 'Moza Ana']);
});
it('PIN correcto entrega token del otro usuario', async () => {
  const r = await pin(app, token, { usuarioId: mozaId, pin: '4321' });
  expect(r.statusCode).toBe(200);
  expect(r.json().usuario.rol).toBe('mesero');
  const yo = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(r.json().accessToken) });
  expect(yo.json().usuario.id).toBe(mozaId);
});
it('PIN incorrecto responde 401 PIN_INCORRECTO', async () => {
  const r = await pin(app, token, { usuarioId: mozaId, pin: '0000' });
  expect(r.statusCode).toBe(401);
  expect(r.json().error.codigo).toBe('PIN_INCORRECTO');
});
it('5 PIN erróneos bloquean 5 minutos, incluso con el PIN correcto', async () => {
  for (let i = 0; i < 5; i++) {
    expect((await pin(app, token, { usuarioId: mozaId, pin: '0000' })).statusCode).toBe(401);
  }
  const r = await pin(app, token, { usuarioId: mozaId, pin: '4321' });
  expect(r.statusCode).toBe(423);
  expect(r.json().error.codigo).toBe('PIN_BLOQUEADO');
  const [u] = await dbs.dbAdmin.select().from(usuarios).where(eq(usuarios.id, mozaId));
  const minutos = (u!.pinBloqueadoHasta!.getTime() - Date.now()) / 60_000;
  expect(minutos).toBeGreaterThan(4.9);
  expect(minutos).toBeLessThanOrEqual(5);
});
it('se desbloquea pasado el plazo y resetea el contador', async () => {
  await dbs.dbAdmin
    .update(usuarios)
    .set({ pinFallos: 5, pinBloqueadoHasta: new Date(Date.now() - 1000) })
    .where(eq(usuarios.id, mozaId));
  expect((await pin(app, token, { usuarioId: mozaId, pin: '4321' })).statusCode).toBe(200);
  const [u] = await dbs.dbAdmin.select().from(usuarios).where(eq(usuarios.id, mozaId));
  expect(u!.pinFallos).toBe(0);
});
it('usuario de otro local no existe', async () => {
  const r = await pin(app, token, { usuarioId: usuarioDeOtroLocal, pin: '1234' });
  expect(r.statusCode).toBe(404);
});
