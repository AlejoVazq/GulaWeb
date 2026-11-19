import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCIONES, puede } from '@gula/shared';
import { ErrorApi } from '../errores.js';
import type { Config } from '../config.js';
import type { Dbs } from '../db/cliente.js';
import * as v from '../validacion.js';
import { firmarAcceso } from '../seguridad/tokens.js';
import { fijarUsuarioDelDispositivo, listarUsuariosActivos, verificarPin } from './pin.js';
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
    const r = await loginDispositivo(dbs, config.jwtSecret, {
      email: b.email,
      password: b.password,
      nombreDispositivo: b.dispositivo.nombre,
    });
    // Los demás dispositivos del local quedaron desactivados: se cortan sus sockets.
    await app.desconectarDispositivos(r.local.id, { exceptoId: r.dispositivoId });
    return r;
  });

  app.post('/auth/refresh', { config: limite }, async (req) => {
    const b = z.object({ refreshToken: z.string().min(1).max(200) }).parse(req.body);
    return refrescar(dbs, config.jwtSecret, b.refreshToken);
  });

  app.get('/auth/yo', { preHandler: app.autenticar }, async (req) => quienSoy(dbs, req.sesion));

  app.post('/auth/logout', { preHandler: app.autenticar }, async (req, reply) => {
    await logout(dbs, req.sesion);
    await app.desconectarDispositivos(req.sesion.localId, { soloId: req.sesion.dispositivoId });
    return reply.status(204).send();
  });

  app.get('/auth/usuarios', { preHandler: app.autenticar }, async (req) =>
    listarUsuariosActivos(dbs, req.sesion.localId),
  );

  /**
   * Autorización de un encargado para una acción puntual (anular, descontar): verifica su PIN sin cambiar
   * el usuario de la PC. Los fallos cuentan para el bloqueo del PIN como en /auth/pin.
   */
  app.post('/auth/autorizar', { preHandler: app.autenticar }, async (req) => {
    const b = z
      .object({ usuarioId: z.uuid(), pin: z.string().max(10), accion: z.enum(ACCIONES) })
      .parse(req.body);
    const usuario = await verificarPin(dbs, req.sesion.localId, b.usuarioId, b.pin).catch((e: unknown) => {
      throw new ErrorApi(403, 'REQUIERE_AUTORIZACION', e instanceof Error ? e.message : 'El PIN no es correcto.');
    });
    if (puede(usuario.rol, b.accion) !== 'si')
      throw new ErrorApi(403, 'REQUIERE_AUTORIZACION', `${usuario.nombre} no puede autorizar esto.`);
    return { usuario };
  });

  app.post('/auth/pin', { preHandler: app.autenticar }, async (req) => {
    const b = z.object({ usuarioId: z.uuid(), pin: z.string().max(10) }).parse(req.body);
    const { localId, dispositivoId } = req.sesion;
    const usuario = await verificarPin(dbs, localId, b.usuarioId, b.pin);
    await fijarUsuarioDelDispositivo(dbs, localId, dispositivoId, usuario.id);
    const accessToken = await firmarAcceso(
      { sub: usuario.id, loc: localId, dev: dispositivoId, rol: usuario.rol },
      config.jwtSecret,
    );
    return { accessToken, usuario };
  });
}
