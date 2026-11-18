import { it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { cargarConfig } from '../src/config.js';
import { configDePrueba, envValido } from './helpers.js';

it('GET /salud responde ok', async () => {
  const app = await buildApp(configDePrueba());
  const r = await app.inject({ method: 'GET', url: '/salud' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ ok: true });
  await app.close();
});
it('ruta inexistente usa el formato de error', async () => {
  const app = await buildApp(configDePrueba());
  const r = await app.inject({ method: 'GET', url: '/nada' });
  expect(r.statusCode).toBe(404);
  expect(r.json().error.codigo).toBe('NO_ENCONTRADO');
  await app.close();
});
it('cargarConfig rechaza JWT_SECRET corto', () => {
  expect(() => cargarConfig({ ...envValido, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
});
it('cargarConfig aplica defaults', () => {
  const c = cargarConfig({ ...envValido, PORT: undefined });
  expect(c.port).toBe(3000);
  expect(c.rateLimitAuth).toBe(10);
});
