import { nuevoId } from '@gula/shared';
import { usuarios } from '../src/db/schema/index.js';
import { hashear } from '../src/seguridad/hash.js';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { crearLocal } from '../src/locales/crearLocal.js';
import { dbs } from './db.js';
import { configDePrueba } from './helpers.js';

export const credenciales = { email: 'dueno@local.com', password: 'secreto123' };

export async function appDePrueba(extra: Partial<Config> = {}): Promise<FastifyInstance> {
  return buildApp(configDePrueba(extra), { dbs });
}

export async function localConDueno(slug = 'local-a', email = credenciales.email) {
  return crearLocal(dbs.dbAdmin, {
    nombre: `Local ${slug}`,
    slug,
    dueno: { nombre: 'Dueño', email, password: credenciales.password, pin: '1234' },
  });
}

export function login(
  app: FastifyInstance,
  datos: { email: string; password: string },
  nombreDispositivo = 'PC caja',
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { ...datos, dispositivo: { nombre: nombreDispositivo } },
  });
}

export function refresh(app: FastifyInstance, refreshToken: string) {
  return app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function crearUsuarioDePrueba(
  localId: string,
  datos: { nombre: string; rol: 'dueno' | 'encargado' | 'mesero'; pin: string },
): Promise<string> {
  const id = nuevoId();
  await dbs.dbAdmin.insert(usuarios).values({
    id,
    localId,
    nombre: datos.nombre,
    rol: datos.rol,
    pinHash: await hashear(datos.pin),
  });
  return id;
}

export function pin(app: FastifyInstance, token: string, datos: { usuarioId: string; pin: string }) {
  return app.inject({ method: 'POST', url: '/auth/pin', headers: bearer(token), payload: datos });
}

/** Loguea la PC con el dueño y devuelve un access token del usuario indicado (vía PIN). */
export async function tokenDe(app: FastifyInstance, usuarioId: string, pinUsuario: string) {
  const base = (await login(app, credenciales)).json().accessToken as string;
  const r = await pin(app, base, { usuarioId, pin: pinUsuario });
  return r.json().accessToken as string;
}

export type Escenario = {
  localId: string;
  tokenDueno: string;
  tokenEncargado: string;
  tokenMoza: string;
  otroLocalId: string;
};

/** Local A con dueño, encargado y moza logueados en la misma PC, y un local B vacío. */
export async function escenario(app: FastifyInstance): Promise<Escenario> {
  const a = await localConDueno('local-a');
  const b = await localConDueno('local-b', 'otro@local.com');
  const encId = await crearUsuarioDePrueba(a.localId, { nombre: 'Enc', rol: 'encargado', pin: '5555' });
  const mozaId = await crearUsuarioDePrueba(a.localId, { nombre: 'Ana', rol: 'mesero', pin: '4321' });
  const tokenDueno = (await login(app, credenciales)).json().accessToken as string;
  const tokenEncargado = (await pin(app, tokenDueno, { usuarioId: encId, pin: '5555' })).json().accessToken;
  const tokenMoza = (await pin(app, tokenDueno, { usuarioId: mozaId, pin: '4321' })).json().accessToken;
  return { localId: a.localId, tokenDueno, tokenEncargado, tokenMoza, otroLocalId: b.localId };
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export const pedir = (app: FastifyInstance, token: string) => (metodo: Metodo, url: string, payload?: object) =>
  app.inject({ method: metodo, url, headers: bearer(token), ...(payload ? { payload } : {}) });
