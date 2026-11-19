import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import {
  abrirMesaLocal,
  aplicarCambiosSalon,
  atenderAvisoLocal,
  cerrarMesaLocal,
  confirmarPedidoLocal,
  crearPedidoLocal,
  leerMesa,
  leerSalon,
  rechazarPedidoLocal,
  siguienteNumero,
  vaciarSalonLocal,
} from '../src/main/db/salon';
import type { RespuestaPullSalon } from '../src/compartido/salon';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
beforeEach(() => {
  base = abrirBase(tmp.ruta(`s${n++}.db`));
});

const T0 = '2026-11-18T20:00:00.000Z';
const T1 = '2026-11-18T20:05:00.000Z';
const meta = (t = T0) => ({ actualizadoEn: t, eliminadoEn: null });
const AHORA = new Date('2026-11-18T21:00:00.000Z');

function pull(extra: Partial<RespuestaPullSalon> = {}): RespuestaPullSalon {
  return {
    cursor: T0,
    mesas: [
      { id: 'm1', nombre: 'Mesa 1', zona: 'Salón', capacidad: 4, orden: 0, token: 't1', ...meta() },
      { id: 'm2', nombre: 'Mesa 2', zona: 'Salón', capacidad: 2, orden: 1, token: 't2', ...meta() },
    ],
    sesiones: [],
    pedidos: [],
    items: [],
    avisos: [],
    ...extra,
  };
}

const sesion = (id: string, mesaId: string, estado = 'abierta') => ({
  id,
  mesaId,
  estado: estado as 'abierta',
  comensales: 2,
  abiertaPor: 'u1',
  abiertaEn: T0,
  cerradaPor: null,
  cerradaEn: null,
  ...meta(),
});

const pedidoQr = (id: string, sesionId: string, mesaId: string) => ({
  id,
  origen: 'qr' as const,
  estado: 'pendiente' as const,
  sesionId,
  mesaId,
  numero: null,
  dia: null,
  notas: null,
  motivoRechazo: null,
  creadoPor: null,
  confirmadoPor: null,
  confirmadoEn: null,
  rechazadoEn: null,
  creadoEn: T0,
  ...meta(),
});

const item = (id: string, pedidoId: string, cantidad = 1) => ({
  id,
  pedidoId,
  productoId: 'p1',
  nombre: 'Hamburguesa',
  precioUnitario: 500000,
  cantidad,
  seleccion: {},
  resumenOpciones: '',
  nota: '',
  sectorId: null,
  anulado: false,
  creadoEn: T0,
  ...meta(),
});

it('siguienteNumero da 1, 2, 3 y reinicia con otro día', () => {
  expect([siguienteNumero(base, '2026-11-18'), siguienteNumero(base, '2026-11-18'), siguienteNumero(base, '2026-11-18')]).toEqual([1, 2, 3]);
  expect(siguienteNumero(base, '2026-11-19')).toBe(1);
});

it('siguienteNumero no repite números que ya están en la base (por ejemplo tras reinstalar)', () => {
  aplicarCambiosSalon(
    base,
    pull({
      sesiones: [sesion('s1', 'm1')],
      pedidos: [{ ...pedidoQr('p1', 's1', 'm1'), estado: 'confirmado', numero: 12, dia: '2026-11-18' } as never],
    }),
  );
  expect(siguienteNumero(base, '2026-11-18')).toBe(13);
});

it('abrir una mesa local la muestra ocupada', () => {
  aplicarCambiosSalon(base, pull());
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: 3, usuarioId: 'u1', ahora: AHORA });
  const s = leerSalon(base);
  expect(s.mesas.map((m) => m.nombre)).toEqual(['Mesa 1', 'Mesa 2']);
  expect(s.mesas[0]!.sesion).toMatchObject({ id: 's1', estado: 'abierta', comensales: 3 });
  expect(s.mesas[1]!.sesion).toBeNull();
});

it('el pull del servidor pisa la sesión creada localmente', () => {
  aplicarCambiosSalon(base, pull());
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: 3, usuarioId: 'u1', ahora: AHORA });
  aplicarCambiosSalon(base, pull({ sesiones: [{ ...sesion('s1', 'm1'), comensales: 5, actualizadoEn: '2020-01-01T00:00:00.000Z' }] }));
  expect(leerSalon(base).mesas[0]!.sesion!.comensales).toBe(5);
});

it('un pull con un pedido QR pendiente aparece en pendientes; confirmarlo local lo saca', () => {
  aplicarCambiosSalon(
    base,
    pull({ sesiones: [sesion('s1', 'm1')], pedidos: [pedidoQr('p1', 's1', 'm1')], items: [item('i1', 'p1', 2)] }),
  );
  const antes = leerSalon(base);
  expect(antes.pendientes).toHaveLength(1);
  expect(antes.pendientes[0]).toMatchObject({ id: 'p1', mesa: { id: 'm1', nombre: 'Mesa 1' }, total: 1000000 });
  expect(antes.pendientes[0]!.items).toHaveLength(1);
  expect(antes.mesas[0]!.pendientes).toBe(1);

  confirmarPedidoLocal(base, { pedidoId: 'p1', numero: 4, dia: '2026-11-18', ajustes: [], usuarioId: 'u1', ahora: AHORA });
  const despues = leerSalon(base);
  expect(despues.pendientes).toEqual([]);
  expect(despues.mesas[0]!.pendientes).toBe(0);
  expect(leerMesa(base, 'm1')!.pedidos[0]).toMatchObject({ estado: 'confirmado', numero: 4 });
});

it('confirmar con cantidad 0 anula el ítem y ajusta el total', () => {
  aplicarCambiosSalon(
    base,
    pull({
      sesiones: [sesion('s1', 'm1')],
      pedidos: [pedidoQr('p1', 's1', 'm1')],
      items: [item('i1', 'p1', 2), item('i2', 'p1', 1)],
    }),
  );
  confirmarPedidoLocal(base, {
    pedidoId: 'p1',
    numero: 1,
    dia: '2026-11-18',
    ajustes: [
      { itemId: 'i1', cantidad: 0 },
      { itemId: 'i2', cantidad: 3 },
    ],
    usuarioId: 'u1',
    ahora: AHORA,
  });
  const p = leerMesa(base, 'm1')!.pedidos[0]!;
  expect(p.items.map((i) => [i.id, i.cantidad])).toEqual([['i2', 3]]);
  expect(p.total).toBe(1500000);
});

it('rechazar local guarda el motivo', () => {
  aplicarCambiosSalon(base, pull({ sesiones: [sesion('s1', 'm1')], pedidos: [pedidoQr('p1', 's1', 'm1')], items: [item('i1', 'p1')] }));
  rechazarPedidoLocal(base, { pedidoId: 'p1', motivo: 'Sin stock', ahora: AHORA });
  expect(leerSalon(base).pendientes).toEqual([]);
  expect(leerMesa(base, 'm1')!.pedidos[0]).toMatchObject({ estado: 'rechazado', motivoRechazo: 'Sin stock' });
});

it('un pedido manual local aparece en el detalle de la mesa con su total', () => {
  aplicarCambiosSalon(base, pull());
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: null, usuarioId: 'u1', ahora: AHORA });
  crearPedidoLocal(base, {
    pedidoId: 'p9',
    origen: 'manual',
    sesionId: 's1',
    numero: 1,
    dia: '2026-11-18',
    notas: null,
    usuarioId: 'u1',
    ahora: AHORA,
    items: [
      {
        itemId: 'i9',
        productoId: 'p1',
        nombre: 'Hamburguesa',
        precioUnitario: 650000,
        cantidad: 2,
        seleccion: { g: ['o'] },
        resumenOpciones: 'Grande',
        nota: 'sin cebolla',
        sectorId: null,
      },
    ],
  });
  const d = leerMesa(base, 'm1')!;
  expect(d.sesion!.id).toBe('s1');
  expect(d.pedidos).toHaveLength(1);
  expect(d.pedidos[0]).toMatchObject({ origen: 'manual', estado: 'confirmado', numero: 1, mesaId: 'm1', total: 1300000 });
  expect(d.pedidos[0]!.items[0]).toMatchObject({ seleccion: { g: ['o'] }, nota: 'sin cebolla' });
});

it('avisos sin atender se ven en la mesa y atenderlos los saca', () => {
  aplicarCambiosSalon(
    base,
    pull({
      sesiones: [sesion('s1', 'm1', 'cuenta_pedida')],
      avisos: [{ id: 'a1', sesionId: 's1', tipo: 'cuenta', atendidoPor: null, atendidoEn: null, creadoEn: T0, ...meta() }],
    }),
  );
  expect(leerSalon(base).mesas[0]!.avisos.map((a) => a.tipo)).toEqual(['cuenta']);
  atenderAvisoLocal(base, { avisoId: 'a1', usuarioId: 'u1', ahora: AHORA });
  expect(leerSalon(base).mesas[0]!.avisos).toEqual([]);
});

it('cerrar la mesa local la libera, rechaza sus pendientes y atiende sus avisos', () => {
  aplicarCambiosSalon(
    base,
    pull({
      sesiones: [sesion('s1', 'm1')],
      pedidos: [pedidoQr('p1', 's1', 'm1')],
      items: [item('i1', 'p1')],
      avisos: [{ id: 'a1', sesionId: 's1', tipo: 'llamar', atendidoPor: null, atendidoEn: null, creadoEn: T0, ...meta() }],
    }),
  );
  cerrarMesaLocal(base, { sesionId: 's1', usuarioId: 'u1', ahora: AHORA });
  const s = leerSalon(base);
  expect(s.mesas[0]!.sesion).toBeNull();
  expect(s.pendientes).toEqual([]);
  expect(s.mesas[0]!.avisos).toEqual([]);
});

it('una mesa borrada en el servidor desaparece', () => {
  aplicarCambiosSalon(base, pull());
  aplicarCambiosSalon(base, pull({ mesas: [{ id: 'm2', nombre: 'Mesa 2', zona: null, capacidad: null, orden: 1, token: 't2', actualizadoEn: T1, eliminadoEn: T1 }] }));
  expect(leerSalon(base).mesas.map((m) => m.id)).toEqual(['m1']);
  expect(leerMesa(base, 'm2')).toBeNull();
});

it('vaciar el salón borra todo', () => {
  aplicarCambiosSalon(base, pull({ sesiones: [sesion('s1', 'm1')] }));
  siguienteNumero(base, '2026-11-18');
  vaciarSalonLocal(base);
  expect(leerSalon(base).mesas).toEqual([]);
  expect(siguienteNumero(base, '2026-11-18')).toBe(1);
});
