import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import type { Dbs } from '../db/cliente.js';
import { validarAcceso } from '../auth/plugin.js';

export type Tema = 'carta';

declare module 'fastify' {
  interface FastifyInstance {
    /** Avisa a las PCs conectadas del local que hay cambios para traer. */
    avisar: (localId: string, tema: Tema) => void;
    /** Corta los sockets de dispositivos que ya no son válidos (otro login, logout). */
    desconectarDispositivos: (localId: string, filtro: { soloId?: string; exceptoId?: string }) => Promise<void>;
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
    app.decorate('desconectarDispositivos', async (localId: string, filtro: { soloId?: string; exceptoId?: string }) => {
    for (const s of await io.in(sala(localId)).fetchSockets()) {
      const dev = (s.data as { sesion?: { dispositivoId: string } }).sesion?.dispositivoId;
      if ((filtro.soloId && dev === filtro.soloId) || (filtro.exceptoId && dev !== filtro.exceptoId)) s.disconnect(true);
    }
  });
  app.addHook('onClose', async () => {
      await io.close();
    });
  },
);
