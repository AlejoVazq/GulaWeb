import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registrarErrores } from './errores.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    trustProxy: true,
  });
  registrarErrores(app);
  app.get('/salud', async () => ({ ok: true }));
  return app;
}
