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
