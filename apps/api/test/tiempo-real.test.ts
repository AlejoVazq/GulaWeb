import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { io, type Socket } from 'socket.io-client';
import { appDePrueba, credenciales, escenario, login, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dir = app.server.address();
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  await app.close();
});
afterAll(() => dbs.cerrar());

function conectar(token: string): Promise<Socket> {
  return new Promise((ok, mal) => {
    const s = io(url, { path: '/tiempo-real', auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => ok(s));
    s.on('connect_error', (err) => mal(err));
  });
}

const esperarEvento = (s: Socket, ms = 1500) =>
  new Promise<unknown>((ok) => {
    const t = setTimeout(() => ok(null), ms);
    s.once('cambios', (d) => {
      clearTimeout(t);
      ok(d);
    });
  });

it('avisa cambios de carta solo a los sockets del mismo local', async () => {
  const propio = await conectar(e.tokenMoza);
  // token del dueño del local B en otra "PC"
  const tokenB = (await login(app, { email: 'otro@local.com', password: credenciales.password })).json().accessToken;
  const ajeno = await conectar(tokenB);
  const [recibido, noRecibido] = await Promise.all([
    esperarEvento(propio),
    esperarEvento(ajeno, 800),
    pedir(app, e.tokenEncargado)('POST', '/carta/categorias', { nombre: 'Tragos' }),
  ]);
  expect(recibido).toEqual({ tema: 'carta' });
  expect(noRecibido).toBeNull();
});

it('token inválido no conecta', async () => {
  await expect(conectar('basura')).rejects.toMatchObject({ message: 'SESION_INVALIDA' });
});
