import type { FastifyInstance } from 'fastify';

/** En un plugin de rutas de carta: tras cada escritura exitosa, avisa a las PCs del local. */
export function avisarCambiosDeCarta(app: FastifyInstance): void {
  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'GET' && reply.statusCode < 400 && req.sesion)
      app.avisar(req.sesion.localId, 'carta');
  });
}
