import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { avisosMesa, itemsPedido, pedidos, sesionesMesa } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { cartaChica, mesaDePrueba, type CartaChica } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
let c: CartaChica;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  c = await cartaChica(e.localId);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const op = (tipo: string, datos: unknown, id = nuevoId()) => ({ id, tipo, datos, creadaEn: new Date().toISOString() });
async function enviar(...operaciones: unknown[]) {
  const r = await pedir(app, e.tokenMoza)('POST', '/sync/operaciones', { operaciones });
  return r.json().resultados as { estado: string; error?: { codigo: string } }[];
}
const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);

const itemManual = (extra: object = {}) => ({
  itemId: nuevoId(),
  productoId: c.hamburguesa,
  nombre: 'Hamburguesa',
  precioUnitario: 650000,
  cantidad: 1,
  seleccion: { [c.tamano]: [c.grande] },
  resumenOpciones: 'Grande',
  nota: '',
  sectorId: c.cocina,
  ...extra,
});

/** Pedido QR pendiente insertado como si viniera del cliente. */
async function pendienteQr(mesa: { id: string; sesionId: string | null }) {
  const pedidoId = nuevoId();
  const items = [nuevoId(), nuevoId()];
  await leer(async (tx) => {
    await tx.insert(pedidos).values({
      id: pedidoId,
      localId: e.localId,
      origen: 'qr',
      estado: 'pendiente',
      sesionId: mesa.sesionId,
      mesaId: mesa.id,
    });
    await tx.insert(itemsPedido).values(
      items.map((id, i) => ({
        id,
        localId: e.localId,
        pedidoId,
        productoId: c.hamburguesa,
        nombre: 'Hamburguesa',
        precioUnitario: 500000,
        cantidad: i + 1,
      })),
    );
  });
  return { pedidoId, items };
}

it('abrir una mesa ocupada con otra sesión → MESA_OCUPADA', async () => {
  const m = await mesaDePrueba(e.localId, 'Mesa 1', false);
  const [a, b] = await enviar(
    op('mesa.abrir', { sesionId: nuevoId(), mesaId: m.id, comensales: 4 }),
    op('mesa.abrir', { sesionId: nuevoId(), mesaId: m.id }),
  );
  expect(a!.estado).toBe('aplicada');
  expect(b).toMatchObject({ estado: 'rechazada', error: { codigo: 'MESA_OCUPADA' } });
  const sesiones = await leer((tx) => tx.select().from(sesionesMesa));
  expect(sesiones).toHaveLength(1);
  expect(sesiones[0]).toMatchObject({ estado: 'abierta', comensales: 4 });
});

it('cerrar una mesa la libera y rechaza sus pedidos QR pendientes', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pendienteQr(m);
  expect((await enviar(op('mesa.cerrar', { sesionId: m.sesionId })))[0]!.estado).toBe('aplicada');
  const [s] = await leer((tx) => tx.select().from(sesionesMesa));
  expect(s).toMatchObject({ estado: 'cerrada' });
  expect(s!.cerradaEn).not.toBeNull();
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p).toMatchObject({ estado: 'rechazado', motivoRechazo: 'La mesa se cerró' });
  const [otra] = await enviar(op('mesa.cerrar', { sesionId: m.sesionId }));
  expect(otra).toMatchObject({ estado: 'rechazada', error: { codigo: 'ESTADO_INVALIDO' } });
});

it('confirmar un pendiente asigna número y día', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pendienteQr(m);
  const [r] = await enviar(op('pedido.confirmar', { pedidoId, numero: 7, dia: '2026-11-18' }));
  expect(r!.estado).toBe('aplicada');
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p).toMatchObject({ estado: 'confirmado', numero: 7, dia: '2026-11-18' });
  expect(p!.confirmadoPor).not.toBeNull();
});

it('ajustar una cantidad a 0 al confirmar quita ese ítem', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId, items } = await pendienteQr(m);
  await enviar(
    op('pedido.confirmar', {
      pedidoId,
      numero: 1,
      dia: '2026-11-18',
      items: [
        { itemId: items[0], cantidad: 0 },
        { itemId: items[1], cantidad: 5 },
      ],
    }),
  );
  const filas = await leer((tx) => tx.select().from(itemsPedido).where(eq(itemsPedido.pedidoId, pedidoId)));
  const porId = new Map(filas.map((f) => [f.id, f]));
  expect(porId.get(items[0]!)!.anulado).toBe(true);
  expect(porId.get(items[1]!)).toMatchObject({ anulado: false, cantidad: 5 });
});

it('no se confirma un pedido dejándolo sin ítems', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId, items } = await pendienteQr(m);
  const [r] = await enviar(
    op('pedido.confirmar', { pedidoId, numero: 1, dia: '2026-11-18', items: items.map((itemId) => ({ itemId, cantidad: 0 })) }),
  );
  expect(r).toMatchObject({ estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS' } });
});

it('confirmar un pedido rechazado → ESTADO_INVALIDO', async () => {
  const m = await mesaDePrueba(e.localId);
  const { pedidoId } = await pendienteQr(m);
  const [rech, conf] = await enviar(
    op('pedido.rechazar', { pedidoId, motivo: 'Sin stock' }),
    op('pedido.confirmar', { pedidoId, numero: 1, dia: '2026-11-18' }),
  );
  expect(rech!.estado).toBe('aplicada');
  expect(conf).toMatchObject({ estado: 'rechazada', error: { codigo: 'ESTADO_INVALIDO' } });
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p).toMatchObject({ estado: 'rechazado', motivoRechazo: 'Sin stock' });
});

it('un pedido manual nace confirmado con los precios de la PC', async () => {
  const m = await mesaDePrueba(e.localId);
  const pedidoId = nuevoId();
  const [r] = await enviar(
    op('pedido.crear', { pedidoId, origen: 'manual', sesionId: m.sesionId, numero: 3, dia: '2026-11-18', items: [itemManual()] }),
  );
  expect(r!.estado).toBe('aplicada');
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p).toMatchObject({ origen: 'manual', estado: 'confirmado', numero: 3, mesaId: m.id, sesionId: m.sesionId });
  const [it] = await leer((tx) => tx.select().from(itemsPedido).where(eq(itemsPedido.pedidoId, pedidoId)));
  expect(it).toMatchObject({ precioUnitario: 650000, resumenOpciones: 'Grande', sectorId: c.cocina });
});

it('un pedido de mostrador no necesita mesa', async () => {
  const pedidoId = nuevoId();
  const [r] = await enviar(op('pedido.crear', { pedidoId, origen: 'mostrador', numero: 1, dia: '2026-11-18', items: [itemManual()] }));
  expect(r!.estado).toBe('aplicada');
});

it('pedido manual con precio negativo → DATOS_INVALIDOS', async () => {
  const m = await mesaDePrueba(e.localId);
  const [r] = await enviar(
    op('pedido.crear', {
      pedidoId: nuevoId(),
      origen: 'manual',
      sesionId: m.sesionId,
      numero: 1,
      dia: '2026-11-18',
      items: [itemManual({ precioUnitario: -100 })],
    }),
  );
  expect(r).toMatchObject({ estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS' } });
});

it('pedido manual en una mesa cerrada → ESTADO_INVALIDO', async () => {
  const m = await mesaDePrueba(e.localId);
  await enviar(op('mesa.cerrar', { sesionId: m.sesionId }));
  const [r] = await enviar(
    op('pedido.crear', { pedidoId: nuevoId(), origen: 'manual', sesionId: m.sesionId, numero: 1, dia: '2026-11-18', items: [itemManual()] }),
  );
  expect(r).toMatchObject({ estado: 'rechazada', error: { codigo: 'ESTADO_INVALIDO' } });
});

it('reintentar pedido.crear con el mismo id de operación da un solo pedido', async () => {
  const m = await mesaDePrueba(e.localId);
  const o = op('pedido.crear', {
    pedidoId: nuevoId(),
    origen: 'manual',
    sesionId: m.sesionId,
    numero: 1,
    dia: '2026-11-18',
    items: [itemManual()],
  });
  await enviar(o);
  await enviar(o);
  expect(await leer((tx) => tx.select().from(pedidos))).toHaveLength(1);
  expect(await leer((tx) => tx.select().from(itemsPedido))).toHaveLength(1);
});

it('abrir mesa, pedir y cerrar sin cobrar en un solo lote: el cierre se rechaza (CUENTA_PENDIENTE)', async () => {
  const m = await mesaDePrueba(e.localId, 'Mesa 5', false);
  const sesionId = nuevoId();
  const resultados = await enviar(
    op('mesa.abrir', { sesionId, mesaId: m.id }),
    op('pedido.crear', { pedidoId: nuevoId(), origen: 'manual', sesionId, numero: 1, dia: '2026-11-18', items: [itemManual()] }),
    op('mesa.cerrar', { sesionId }),
  );
  expect(resultados.map((r) => r.estado)).toEqual(['aplicada', 'aplicada', 'rechazada']);
  expect(resultados[2]!.error!.codigo).toBe('CUENTA_PENDIENTE');
});

it('atender un aviso registra quién y cuándo', async () => {
  const m = await mesaDePrueba(e.localId);
  const avisoId = nuevoId();
  await leer((tx) => tx.insert(avisosMesa).values({ id: avisoId, localId: e.localId, sesionId: m.sesionId!, tipo: 'llamar' }));
  const [r] = await enviar(op('aviso.atender', { avisoId }));
  expect(r!.estado).toBe('aplicada');
  const [a] = await leer((tx) => tx.select().from(avisosMesa));
  expect(a!.atendidoEn).not.toBeNull();
  expect(a!.atendidoPor).not.toBeNull();
});

it('lo hecho sin conexión conserva la hora en que se hizo, no la de la reconexión', async () => {
  const m = await mesaDePrueba(e.localId, 'Mesa 8', false);
  const sesionId = nuevoId();
  const pedidoId = nuevoId();
  const haceDosHoras = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const haceUnaHora = new Date(Date.now() - 3_600_000).toISOString();
  await enviar(
    { ...op('mesa.abrir', { sesionId, mesaId: m.id }), creadaEn: haceDosHoras },
    {
      ...op('pedido.crear', { pedidoId, origen: 'manual', sesionId, numero: 1, dia: '2026-11-18', items: [itemManual()] }),
      creadaEn: haceUnaHora,
    },
  );
  const [s] = await leer((tx) => tx.select().from(sesionesMesa).where(eq(sesionesMesa.id, sesionId)));
  expect(s!.abiertaEn.toISOString()).toBe(haceDosHoras);
  const [p] = await leer((tx) => tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)));
  expect(p!.creadoEn.toISOString()).toBe(haceUnaHora);
  expect(p!.confirmadoEn!.toISOString()).toBe(haceUnaHora);
});

it('una hora del futuro (reloj de la PC adelantado) se toma como ahora', async () => {
  const m = await mesaDePrueba(e.localId, 'Mesa 9', false);
  const sesionId = nuevoId();
  await enviar({ ...op('mesa.abrir', { sesionId, mesaId: m.id }), creadaEn: new Date(Date.now() + 86_400_000).toISOString() });
  const [s] = await leer((tx) => tx.select().from(sesionesMesa).where(eq(sesionesMesa.id, sesionId)));
  expect(s!.abiertaEn.getTime()).toBeLessThanOrEqual(Date.now());
});
