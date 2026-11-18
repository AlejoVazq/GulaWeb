import { it, expect, beforeEach, afterEach, afterAll, describe } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { itemsPedido, pedidos, sesionesMesa } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { cartaChica, mesaDePrueba, type CartaChica } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
let c: CartaChica;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dir = app.server.address();
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  await app.close();
});
afterAll(() => dbs.cerrar());

/** Simula la PC del local conectada por tiempo real. */
function conectarPc(token = e.tokenMoza): Promise<Socket> {
  return new Promise((ok, mal) => {
    const s = io(url, { path: '/tiempo-real', auth: { token }, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.on('connect', () => ok(s));
    s.on('connect_error', mal);
  });
}

const publico = (metodo: 'GET' | 'POST', ruta: string, payload?: object) =>
  app.inject({ method: metodo, url: ruta, ...(payload ? { payload } : {}) });

const hamburguesaGrande = (cantidad = 2) => ({
  productoId: c.hamburguesa,
  seleccion: { [c.tamano]: [c.grande] },
  nota: 'sin cebolla',
  cantidad,
});

describe('GET /publico/mesas/:token', () => {
  it('mesa abierta con PC conectada acepta pedidos', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    const r = await publico('GET', `/publico/mesas/${m.token}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      mesa: { nombre: 'Mesa 1' },
      local: { nombre: 'Local local-a', slug: 'local-a' },
      aceptaPedidos: true,
      motivo: null,
    });
  });

  it('mesa cerrada no acepta pedidos', async () => {
    const m = await mesaDePrueba(e.localId, 'Mesa 1', false);
    await conectarPc();
    expect((await publico('GET', `/publico/mesas/${m.token}`)).json()).toMatchObject({
      aceptaPedidos: false,
      motivo: 'mesa_cerrada',
    });
  });

  it('sin PC conectada avisa que el local no recibe pedidos', async () => {
    const m = await mesaDePrueba(e.localId);
    expect((await publico('GET', `/publico/mesas/${m.token}`)).json()).toMatchObject({
      aceptaPedidos: false,
      motivo: 'local_sin_conexion',
    });
  });

  it('token desconocido → 404', async () => {
    const r = await publico('GET', '/publico/mesas/AAAAAAAAAAAAAAAAAAAAAA');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.codigo).toBe('MESA_NO_ENCONTRADA');
  });

  it('el token viejo deja de resolver al regenerarlo', async () => {
    const d = pedir(app, e.tokenDueno);
    const m = (await d('POST', '/salon/mesas', { nombre: 'Mesa 9' })).json();
    expect((await publico('GET', `/publico/mesas/${m.token}`)).statusCode).toBe(200);
    await d('POST', `/salon/mesas/${m.id}/regenerar-token`);
    expect((await publico('GET', `/publico/mesas/${m.token}`)).statusCode).toBe(404);
  });
});

describe('POST /publico/mesas/:token/pedidos', () => {
  it('con la mesa cerrada → 409 MESA_CERRADA', async () => {
    const m = await mesaDePrueba(e.localId, 'Mesa 1', false);
    await conectarPc();
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [hamburguesaGrande()] });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('MESA_CERRADA');
  });

  it('sin PC conectada → 503 LOCAL_SIN_CONEXION', async () => {
    const m = await mesaDePrueba(e.localId);
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [hamburguesaGrande()] });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toEqual({
      codigo: 'LOCAL_SIN_CONEXION',
      mensaje: 'El local no está recibiendo pedidos por acá en este momento. Pedile a la moza.',
    });
  });

  it('crea un pedido pendiente con los precios del servidor, ignorando los del cliente', async () => {
    const m = await mesaDePrueba(e.localId);
    const pc = await conectarPc();
    const aviso = new Promise((ok) => pc.once('cambios', ok));
    const id = nuevoId();
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, {
      id,
      total: 1,
      items: [{ ...hamburguesaGrande(2), precio: 1, precioUnitario: 1 }],
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({
      id,
      estado: 'pendiente',
      motivoRechazo: null,
      total: 1300000,
      items: [{ nombre: 'Hamburguesa', cantidad: 2, resumenOpciones: 'Grande', subtotal: 1300000 }],
    });
    expect(await aviso).toEqual({ tema: 'salon' });

    const [p] = await conLocal(dbs.dbApp, e.localId, (tx) => tx.select().from(pedidos).where(eq(pedidos.id, id)));
    expect(p).toMatchObject({ origen: 'qr', estado: 'pendiente', mesaId: m.id, sesionId: m.sesionId, numero: null });
    const [it] = await conLocal(dbs.dbApp, e.localId, (tx) =>
      tx.select().from(itemsPedido).where(eq(itemsPedido.pedidoId, id)),
    );
    expect(it).toMatchObject({ precioUnitario: 650000, cantidad: 2, nota: 'sin cebolla', sectorId: c.cocina });
  });

  it('producto sin stock → 400 con su nombre', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, {
      id: nuevoId(),
      items: [{ productoId: c.agua, seleccion: {}, nota: '', cantidad: 1 }],
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe('PRODUCTO_NO_DISPONIBLE');
    expect(r.json().error.mensaje).toContain('Agua');
  });

  it('opción de otro producto → 400', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, {
      id: nuevoId(),
      items: [{ productoId: c.hamburguesa, seleccion: { [c.tamano]: [c.muzza] }, nota: '', cantidad: 1 }],
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe('DATOS_INVALIDOS');
  });

  it('cantidades fuera de rango y grupo obligatorio vacío → 400', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    for (const item of [hamburguesaGrande(0), hamburguesaGrande(999), { ...hamburguesaGrande(), seleccion: {} }]) {
      const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [item] });
      expect(r.statusCode).toBe(400);
    }
    const sinItems = await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [] });
    expect(sinItems.statusCode).toBe(400);
    expect(await conLocal(dbs.dbApp, e.localId, (tx) => tx.select().from(pedidos))).toEqual([]);
  });

  it('el mismo id dos veces da un solo pedido', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    const cuerpo = { id: nuevoId(), items: [hamburguesaGrande()] };
    const [a, b] = await Promise.all([
      publico('POST', `/publico/mesas/${m.token}/pedidos`, cuerpo),
      publico('POST', `/publico/mesas/${m.token}/pedidos`, cuerpo),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json()).toEqual(b.json());
    const tercero = await publico('POST', `/publico/mesas/${m.token}/pedidos`, cuerpo);
    expect(tercero.statusCode).toBe(200);
    expect(await conLocal(dbs.dbApp, e.localId, (tx) => tx.select().from(itemsPedido))).toHaveLength(1);
  });

  it('el id de un pedido de otra mesa no se reutiliza', async () => {
    const m1 = await mesaDePrueba(e.localId, 'Mesa 1');
    const m2 = await mesaDePrueba(e.localId, 'Mesa 2');
    await conectarPc();
    const cuerpo = { id: nuevoId(), items: [hamburguesaGrande()] };
    expect((await publico('POST', `/publico/mesas/${m1.token}/pedidos`, cuerpo)).statusCode).toBe(201);
    expect((await publico('POST', `/publico/mesas/${m2.token}/pedidos`, cuerpo)).statusCode).toBe(409);
  });

  it('más de 10 pedidos por minuto desde una mesa → 429', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    const codigos = [];
    for (let i = 0; i < 11; i++) {
      codigos.push(
        (await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [hamburguesaGrande(1)] }))
          .statusCode,
      );
    }
    expect(codigos.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(codigos[10]).toBe(429);
  });
});

describe('GET /publico/pedidos/:id', () => {
  it('devuelve el estado con el token de su mesa y 404 con el de otra', async () => {
    const m1 = await mesaDePrueba(e.localId, 'Mesa 1');
    const m2 = await mesaDePrueba(e.localId, 'Mesa 2');
    await conectarPc();
    const id = nuevoId();
    await publico('POST', `/publico/mesas/${m1.token}/pedidos`, { id, items: [hamburguesaGrande()] });
    const bien = await publico('GET', `/publico/pedidos/${id}?token=${m1.token}`);
    expect(bien.statusCode).toBe(200);
    expect(bien.json()).toMatchObject({ id, estado: 'pendiente' });
    expect((await publico('GET', `/publico/pedidos/${id}?token=${m2.token}`)).statusCode).toBe(404);
    expect((await publico('GET', `/publico/pedidos/${id}`)).statusCode).toBe(400);
  });
});

describe('POST /publico/mesas/:token/avisos', () => {
  it('pedir la cuenta pasa la sesión a cuenta_pedida y no duplica el aviso', async () => {
    const m = await mesaDePrueba(e.localId);
    const a = await publico('POST', `/publico/mesas/${m.token}/avisos`, { tipo: 'cuenta' });
    expect(a.statusCode).toBe(201);
    const b = await publico('POST', `/publico/mesas/${m.token}/avisos`, { tipo: 'cuenta' });
    expect(b.statusCode).toBe(200);
    expect(b.json().id).toBe(a.json().id);
    const [s] = await conLocal(dbs.dbApp, e.localId, (tx) =>
      tx.select().from(sesionesMesa).where(eq(sesionesMesa.id, m.sesionId!)),
    );
    expect(s!.estado).toBe('cuenta_pedida');
  });

  it('con la cuenta pedida se puede seguir pidiendo', async () => {
    const m = await mesaDePrueba(e.localId);
    await conectarPc();
    await publico('POST', `/publico/mesas/${m.token}/avisos`, { tipo: 'cuenta' });
    const r = await publico('POST', `/publico/mesas/${m.token}/pedidos`, { id: nuevoId(), items: [hamburguesaGrande()] });
    expect(r.statusCode).toBe(201);
  });

  it('llamar a la moza con la mesa cerrada → 409', async () => {
    const m = await mesaDePrueba(e.localId, 'Mesa 1', false);
    const r = await publico('POST', `/publico/mesas/${m.token}/avisos`, { tipo: 'llamar' });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe('MESA_CERRADA');
  });
});
