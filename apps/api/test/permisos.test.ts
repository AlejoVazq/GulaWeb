import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { appDePrueba, bearer, crearUsuarioDePrueba, localConDueno, tokenDe } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let tokenMoza: string;
let encargadoId: string;
let otraMozaId: string;

beforeEach(async () => {
  await limpiarDb();
  const a = await localConDueno('local-a');
  const mozaId = await crearUsuarioDePrueba(a.localId, { nombre: 'Ana', rol: 'mesero', pin: '4321' });
  encargadoId = await crearUsuarioDePrueba(a.localId, { nombre: 'Enc', rol: 'encargado', pin: '5555' });
  otraMozaId = await crearUsuarioDePrueba(a.localId, { nombre: 'Bea', rol: 'mesero', pin: '1111' });
  app = await appDePrueba();
  app.post(
    '/_prueba/anular',
    { preHandler: [app.autenticar, app.requierePermiso('pedido.anular')] },
    async (req) => ({ autorizadoPor: req.autorizadoPor ?? null }),
  );
  app.post(
    '/_prueba/cobrar',
    { preHandler: [app.autenticar, app.requierePermiso('cobro.registrar')] },
    async () => ({ ok: true }),
  );
  tokenMoza = await tokenDe(app, mozaId, '4321');
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const post = (url: string, token: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, headers: { ...bearer(token), ...headers } });

it('acción "no" responde 403 SIN_PERMISO', async () => {
  const r = await post('/_prueba/cobrar', tokenMoza);
  expect(r.statusCode).toBe(403);
  expect(r.json().error.codigo).toBe('SIN_PERMISO');
});
it('mesero sin autorización recibe 403 REQUIERE_AUTORIZACION', async () => {
  const r = await post('/_prueba/anular', tokenMoza);
  expect(r.statusCode).toBe(403);
  expect(r.json().error.codigo).toBe('REQUIERE_AUTORIZACION');
});
it('mesero con PIN del encargado pasa y queda quién autorizó', async () => {
  const r = await post('/_prueba/anular', tokenMoza, {
    'x-autoriza-usuario': encargadoId,
    'x-autoriza-pin': '5555',
  });
  expect(r.statusCode).toBe(200);
  expect(r.json().autorizadoPor).toBe(encargadoId);
});
it('PIN de encargado incorrecto no autoriza', async () => {
  const r = await post('/_prueba/anular', tokenMoza, {
    'x-autoriza-usuario': encargadoId,
    'x-autoriza-pin': '0000',
  });
  expect(r.json().error.codigo).toBe('REQUIERE_AUTORIZACION');
});
it('un mesero no puede autorizar a otro mesero', async () => {
  const r = await post('/_prueba/anular', tokenMoza, {
    'x-autoriza-usuario': otraMozaId,
    'x-autoriza-pin': '1111',
  });
  expect(r.statusCode).toBe(403);
});
