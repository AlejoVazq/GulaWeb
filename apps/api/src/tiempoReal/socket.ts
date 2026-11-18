import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import type { Dbs } from '../db/cliente.js';
import { validarAcceso } from '../auth/plugin.js';

export type Tema = 'carta';

declare module 'fastify' {
  interface FastifyInstance {
    /** Avisa a las PCs conectadas del local que hay cambios para traer. */
    avisar: (localId: string, tema: Tema) => void;
  }
}

const sala = (localId: string) => `local:${localId}`;

export const pluginTiempoReal = fp<{ dbs: Dbs; jwtSecret: string }>(
  async (app, { dbs, jwtSecret }) => {
    const io = new Server(app.server, {
      path: '/tiempo-real',
      serveClient: false,
      cors: { origin: false },
    });

    io.use((socket, siguiente) => {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      if (typeof token !== 'string') return siguiente(new Error('SESION_INVALIDA'));
      validarAcceso(dbs, jwtSecret, token)
        .then((sesion) => {
          socket.data.sesion = sesion;
          void socket.join(sala(sesion.localId));
          siguiente();
        })
        .catch(() => siguiente(new Error('SESION_INVALIDA')));
    });

    app.decorate('avisar', (localId: string, tema: Tema) => {
      io.to(sala(localId)).emit('cambios', { tema });
    });
    app.addHook('onClose', async () => {
      await io.close();
    });
  },
);
