import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { Dbs } from '../db/cliente.js';
import * as v from '../validacion.js';
import { loginDispositivo, logout, quienSoy, refrescar } from './servicio.js';

const cuerpoLogin = z.object({
  email: v.email,
  password: z.string().min(1).max(200),
  dispositivo: z.object({ nombre: v.nombre }),
});

export async function rutasAuth(app: FastifyInstance, opts: { config: Config; dbs: Dbs }) {
  const { config, dbs } = opts;
  const limite = { rateLimit: { max: config.rateLimitAuth, timeWindow: '1 minute' } };

  app.post('/auth/login', { config: limite }, async (req) => {
    const b = cuerpoLogin.parse(req.body);
    return loginDispositivo(dbs, config.jwtSecret, {
      email: b.email,
      password: b.password,
      nombreDispositivo: b.dispositivo.nombre,
    });
  });

  app.post('/auth/refresh', { config: limite }, async (req) => {
    const b = z.object({ refreshToken: z.string().min(1).max(200) }).parse(req.body);
    return refrescar(dbs, config.jwtSecret, b.refreshToken);
  });

  app.get('/auth/yo', { preHandler: app.autenticar }, async (req) => quienSoy(dbs, req.sesion));

  app.post('/auth/logout', { preHandler: app.autenticar }, async (req, reply) => {
    await logout(dbs, req.sesion);
    return reply.status(204).send();
  });
}
