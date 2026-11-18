import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { puede, type Accion } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { ErrorApi } from '../errores.js';
import { verificarPin } from '../auth/pin.js';

declare module 'fastify' {
  interface FastifyInstance {
    requierePermiso: (accion: Accion) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const requiereAutorizacion = () =>
  new ErrorApi(403, 'REQUIERE_AUTORIZACION', 'Esta acción necesita el PIN de un encargado.');

/**
 * `app.requierePermiso(accion)`: aplica la matriz de permisos (spec §10). Si la acción es
 * "con_autorizacion", exige los headers x-autoriza-usuario / x-autoriza-pin de alguien que sí pueda.
 */
export const pluginPermisos = fp<{ dbs: Dbs }>(async (app, { dbs }) => {
  app.decorate('requierePermiso', (accion: Accion) => async (req: FastifyRequest) => {
    const permiso = puede(req.sesion.rol, accion);
    if (permiso === 'si') return;
    if (permiso === 'no') {
      throw new ErrorApi(403, 'SIN_PERMISO', 'No tenés permiso para hacer esto.');
    }
    const autorizaId = req.headers['x-autoriza-usuario'];
    const autorizaPin = req.headers['x-autoriza-pin'];
    if (typeof autorizaId !== 'string' || typeof autorizaPin !== 'string') throw requiereAutorizacion();
    try {
      const autorizante = await verificarPin(dbs, req.sesion.localId, autorizaId, autorizaPin);
      if (puede(autorizante.rol, accion) !== 'si') throw requiereAutorizacion();
      req.autorizadoPor = autorizante.id;
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'PIN_BLOQUEADO') throw e;
      throw requiereAutorizacion();
    }
  });
});
