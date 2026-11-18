import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config } from '../src/config.js';

export const envValido = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://gula_app:gula_app@localhost:5433/gula_test',
  DATABASE_ADMIN_URL:
    process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5433/gula_test',
  JWT_SECRET: 'secreto-de-pruebas-de-al-menos-32-caracteres',
} satisfies NodeJS.ProcessEnv;

export function configDePrueba(extra: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: envValido.DATABASE_URL,
    databaseAdminUrl: envValido.DATABASE_ADMIN_URL,
    jwtSecret: envValido.JWT_SECRET,
    rateLimitAuth: 1000,
    dirFotos: join(tmpdir(), 'gula-fotos-test'),
    ...extra,
  };
}
