import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { auditoria, usuarios } from '../src/db/schema/index.js';
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
let tokenDueno: string;
let tokenMoza: string;
let duenoId: string;
let usuarioDeOtroLocal: string;

beforeEach(async () => {
  await limpiarDb();
  const a = await localConDueno('local-a');
  const b = await localConDueno('local-b', 'otro@local.com');
  duenoId = a.duenoId;
  usuarioDeOtroLocal = b.duenoId;
  const mozaId = await crearUsuarioDePrueba(a.localId, { nombre: 'Ana', rol: 'mesero', pin: '4321' });
  app = await appDePrueba();
  tokenDueno = (await login(app, credenciales)).json().accessToken;
  tokenMoza = (await pin(app, tokenDueno, { usuarioId: mozaId, pin: '4321' })).json().accessToken;
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const crearUsuario = (token: string, payload: object) =>
  app.inject({ method: 'POST', url: '/usuarios', headers: bearer(token), payload });
const patchUsuario = (token: string, id: string, payload: object) =>
  app.inject({ method: 'PATCH', url: `/usuarios/${id}`, headers: bearer(token), payload });

it('mesero no puede crear usuarios', async () => {
  const r = await crearUsuario(tokenMoza, { nombre: 'Lu', rol: 'mesero', pin: '2468' });
  expect(r.statusCode).toBe(403);
  expect(r.json().error.codigo).toBe('SIN_PERMISO');
});
it('dueño crea mesero y queda auditado sin hashes', async () => {
  const r = await crearUsuario(tokenDueno, { nombre: 'Lu', rol: 'mesero', pin: '2468' });
  expect(r.statusCode).toBe(201);
  expect(r.json()).toMatchObject({ nombre: 'Lu', rol: 'mesero', activo: true });
  expect(JSON.stringify(r.json())).not.toMatch(/hash/i);
  const [a] = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'usuario.crear'));
  expect(a!.usuarioId).toBe(duenoId);
  expect(JSON.stringify(a!.despues)).not.toMatch(/hash/i);
});
it('encargado requiere email y password', async () => {
  const r = await crearUsuario(tokenDueno, { nombre: 'Enc', rol: 'encargado', pin: '2468' });
  expect(r.statusCode).toBe(400);
  expect(r.json().error.codigo).toBe('DATOS_INVALIDOS');
});
it('GET /usuarios lista solo los del local, sin hashes', async () => {
  const r = await app.inject({ method: 'GET', url: '/usuarios', headers: bearer(tokenDueno) });
  expect(r.json().map((u: { nombre: string }) => u.nombre).sort()).toEqual(['Ana', 'Dueño']);
  expect(JSON.stringify(r.json())).not.toMatch(/hash/i);
});
it('PATCH a usuario de otro local responde 404 y no lo cambia', async () => {
  const r = await patchUsuario(tokenDueno, usuarioDeOtroLocal, { nombre: 'X' });
  expect(r.statusCode).toBe(404);
  const [u] = await dbs.dbAdmin.select().from(usuarios).where(eq(usuarios.id, usuarioDeOtroLocal));
  expect(u!.nombre).toBe('Dueño');
});
it('PATCH cambia el PIN y audita antes/después', async () => {
  const [moza] = await dbs.dbAdmin.select().from(usuarios).where(eq(usuarios.nombre, 'Ana'));
  const r = await patchUsuario(tokenDueno, moza!.id, { nombre: 'Ana María', pin: '8642' });
  expect(r.statusCode).toBe(200);
  expect(r.json().nombre).toBe('Ana María');
  const [a] = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'usuario.editar'));
  expect(a!.antes).toMatchObject({ nombre: 'Ana' });
  expect(a!.despues).toMatchObject({ nombre: 'Ana María' });
});
it('no se puede desactivar al último dueño', async () => {
  const r = await patchUsuario(tokenDueno, duenoId, { activo: false });
  expect(r.statusCode).toBe(409);
  expect(r.json().error.codigo).toBe('ULTIMO_DUENO');
});
it('no se puede bajar de rol al último dueño', async () => {
  const r = await patchUsuario(tokenDueno, duenoId, { rol: 'encargado' });
  expect(r.json().error.codigo).toBe('ULTIMO_DUENO');
});

it('dos bajas simultáneas de dueños no dejan al local sin dueño', async () => {
  const [d1] = await dbs.dbAdmin.select().from(usuarios).where(eq(usuarios.id, duenoId));
  const otroDueno = await crearUsuarioDePrueba(d1!.localId, { nombre: 'Socio', rol: 'dueno', pin: '7777' });
  for (let i = 0; i < 5; i++) {
    await dbs.dbAdmin.update(usuarios).set({ activo: true }).where(eq(usuarios.rol, 'dueno'));
    await Promise.all([
      patchUsuario(tokenDueno, otroDueno, { activo: false }),
      patchUsuario(tokenDueno, duenoId, { rol: 'encargado' }),
    ]);
    const activos = await dbs.dbAdmin
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.localId, d1!.localId), eq(usuarios.rol, 'dueno'), eq(usuarios.activo, true)));
    expect(activos.length).toBeGreaterThanOrEqual(1);
    await dbs.dbAdmin.update(usuarios).set({ rol: 'dueno' }).where(eq(usuarios.id, duenoId));
  }
});
