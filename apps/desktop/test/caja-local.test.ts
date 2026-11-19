import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { abrirMesaLocal, aplicarCambiosSalon, crearPedidoLocal, leerMesa, leerSalon } from '../src/main/db/salon';
import {
  abrirCajaLocal,
  anularItemLocal,
  aplicarCambiosCaja,
  cerrarCajaLocal,
  cobrarLocal,
  leerCaja,
  movimientoLocal,
  porCobrarMostrador,
  revertirOperacionCaja,
} from '../src/main/db/caja';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
const T0 = '2026-11-18T20:00:00.000Z';
const AHORA = new Date('2026-11-18T21:00:00.000Z');
const quien = { usuarioId: 'u1', ahora: AHORA };

beforeEach(() => {
  base = abrirBase(tmp.ruta(`cl${n++}.db`));
  aplicarCambiosSalon(base, {
    cursor: T0,
    mesas: [{ id: 'm1', nombre: 'Mesa 1', zona: null, capacidad: null, orden: 0, token: 't', actualizadoEn: T0, eliminadoEn: null }],
    sesiones: [],
    pedidos: [],
    items: [],
    avisos: [],
  });
});

const item = (itemId: string, precioUnitario: number) => ({
  itemId, productoId: 'p1', nombre: 'Pizza', precioUnitario, cantidad: 1, seleccion: {}, resumenOpciones: '', nota: '', sectorId: null,
});
function pedido(pedidoId: string, sesionId: string | null, precio: number, numero = 1) {
  crearPedidoLocal(base, {
    pedidoId, origen: sesionId ? 'manual' : 'mostrador', sesionId, numero, dia: '2026-11-18', notas: null,
    items: [item(`${pedidoId}-i`, precio)], ...quien,
  });
}

it('abrir la caja y cobrar dividido muestra el resumen por método', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 1000000, ...quien });
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: null, ...quien });
  pedido('p1', 's1', 2000000);
  cobrarLocal(base, {
    cobroId: 'c1', turnoId: 't1', sesionId: 's1', pedidoId: null, subtotal: 2000000, descuento: 0, motivoDescuento: null,
    pagos: [
      { pagoId: 'pg1', metodo: 'efectivo', monto: 1500000, propina: 100000 },
      { pagoId: 'pg2', metodo: 'debito', monto: 500000, propina: 0 },
    ],
    ...quien,
  });
  movimientoLocal(base, { movimientoId: 'mv1', turnoId: 't1', tipo: 'egreso', categoria: 'proveedores', monto: 300000, motivo: 'Hielo', ...quien });
  const c = leerCaja(base);
  expect(c.turno).toMatchObject({ id: 't1', fondo: 1000000 });
  expect(c.resumen!.porMetodo.efectivo).toEqual({ ventas: 1500000, propinas: 100000 });
  expect(c.resumen!.porMetodo.debito.ventas).toBe(500000);
  expect(c.resumen!.efectivoEsperado).toBe(1000000 + 1500000 + 100000 - 300000);
  expect(c.cobros).toHaveLength(1);
  expect(c.cobros[0]).toMatchObject({ total: 2000000, destino: 'Mesa 1' });
  expect(c.cobros[0]!.pagos).toHaveLength(2);
  expect(c.movimientos[0]).toMatchObject({ motivo: 'Hielo', monto: 300000 });
});

it('cobrar una mesa la cierra y sus pedidos quedan cobrados', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 0, ...quien });
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: null, ...quien });
  pedido('p1', 's1', 500000);
  cobrarLocal(base, {
    cobroId: 'c1', turnoId: 't1', sesionId: 's1', pedidoId: null, subtotal: 500000, descuento: 0, motivoDescuento: null,
    pagos: [{ pagoId: 'pg1', metodo: 'efectivo', monto: 500000, propina: 0 }], ...quien,
  });
  expect(leerSalon(base).mesas[0]!.sesion).toBeNull();
  const estado = base.db.prepare("SELECT estado FROM pedidos WHERE id = 'p1'").get() as { estado: string };
  expect(estado.estado).toBe('cobrado');
});

it('un pedido de mostrador queda por cobrar hasta que se cobra', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 0, ...quien });
  pedido('p2', null, 300000);
  expect(porCobrarMostrador(base).map((p) => p.id)).toEqual(['p2']);
  cobrarLocal(base, {
    cobroId: 'c2', turnoId: 't1', sesionId: null, pedidoId: 'p2', subtotal: 300000, descuento: 0, motivoDescuento: null,
    pagos: [{ pagoId: 'pg', metodo: 'transferencia', monto: 300000, propina: 0 }], ...quien,
  });
  expect(porCobrarMostrador(base)).toEqual([]);
  expect(leerCaja(base).cobros[0]!.destino).toBe('Mostrador · Pedido 1');
});

it('cerrar la caja guarda contado, esperado y diferencia', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 1000000, ...quien });
  cerrarCajaLocal(base, { turnoId: 't1', contado: 950000, esperado: 1000000, notas: null, ...quien });
  const c = leerCaja(base);
  expect(c.turno).toBeNull();
  expect(c.ultimoCierre).toMatchObject({ id: 't1', contado: 950000, esperado: 1000000, diferencia: -50000 });
});

it('el pull del servidor pisa la caja local', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 1000000, ...quien });
  aplicarCambiosCaja(base, {
    cursor: T0,
    turnos: [
      {
        id: 't1', abiertoPor: 'u1', abiertoEn: T0, fondo: 1000000, cerradoPor: 'u1', cerradoEn: T0, contado: 1000000, esperado: 1000000,
        diferencia: 0, notas: null, actualizadoEn: T0, eliminadoEn: null,
      },
    ],
    cobros: [],
    pagos: [],
    movimientos: [],
  });
  expect(leerCaja(base).turno).toBeNull();
});

it('anular el único ítem deja el pedido anulado y la mesa sin total', () => {
  abrirMesaLocal(base, { sesionId: 's1', mesaId: 'm1', comensales: null, ...quien });
  pedido('p1', 's1', 500000);
  anularItemLocal(base, { itemId: 'p1-i', pedidoId: 'p1', motivo: 'Se equivocó', ...quien });
  const d = leerMesa(base, 'm1')!;
  expect(d.pedidos[0]).toMatchObject({ estado: 'anulado', total: 0, motivoAnulacion: 'Se equivocó' });
});

it('un cobro rechazado por el servidor se borra de la PC', () => {
  abrirCajaLocal(base, { turnoId: 't1', fondo: 0, ...quien });
  pedido('p2', null, 300000);
  cobrarLocal(base, {
    cobroId: 'c2', turnoId: 't1', sesionId: null, pedidoId: 'p2', subtotal: 300000, descuento: 0, motivoDescuento: null,
    pagos: [{ pagoId: 'pg', metodo: 'efectivo', monto: 300000, propina: 0 }], ...quien,
  });
  revertirOperacionCaja(base, 'cuenta.cobrar', { cobroId: 'c2' });
  expect(leerCaja(base).cobros).toEqual([]);
  revertirOperacionCaja(base, 'caja.abrir', { turnoId: 't1' });
  expect(leerCaja(base).turno).toBeNull();
});
