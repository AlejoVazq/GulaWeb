import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, lt, or, isNull } from 'drizzle-orm';
import type { Rol } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { dispositivos, usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { verificarAcceso } from '../seguridad/tokens.js';

export type Sesion = { usuarioId: string; localId: string; dispositivoId: string; rol: Rol };

declare module 'fastify' {
  interface FastifyInstance {
    autenticar: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    sesion: Sesion;
    autorizadoPor?: string;
  }
}

export const sesionInvalida = () =>
  new ErrorApi(401, 'SESION_INVALIDA', 'Tu sesión no es válida. Volvé a ingresar.');

export const pluginAuth = fp<{ dbs: Dbs; jwtSecret: string }>(async (app, { dbs, jwtSecret }) => {
  app.decorateRequest('sesion', null as unknown as Sesion);

  app.decorate('autenticar', async (req: FastifyRequest) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw sesionInvalida();
    const c = await verificarAcceso(h.slice(7), jwtSecret);

    // Se valida en cada request: dar de baja un usuario o dispositivo corta el acceso al instante.
    const vigente = await conLocal(dbs.dbApp, c.loc, async (tx) => {
      const [d] = await tx
        .select({ id: dispositivos.id })
        .from(dispositivos)
        .where(and(eq(dispositivos.id, c.dev), eq(dispositivos.activo, true)));
      const [u] = await tx
        .select({ rol: usuarios.rol })
        .from(usuarios)
        .where(and(eq(usuarios.id, c.sub), eq(usuarios.activo, true)));
      if (!d || !u) return null;
      const haceUnMinuto = new Date(Date.now() - 60_000);
      await tx
        .update(dispositivos)
        .set({ ultimoUso: new Date() })
        .where(
          and(
            eq(dispositivos.id, c.dev),
            or(isNull(dispositivos.ultimoUso), lt(dispositivos.ultimoUso, haceUnMinuto)),
          ),
        );
      return u;
    });
    if (!vigente) throw sesionInvalida();
    // El rol se toma de la base, no del token, por si cambió.
    req.sesion = { usuarioId: c.sub, localId: c.loc, dispositivoId: c.dev, rol: vigente.rol };
  });
});
