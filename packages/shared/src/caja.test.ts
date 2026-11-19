import { describe, expect, it } from 'vitest';
import { METODOS_PAGO, NOMBRE_METODO, montoDescuento, resumenTurno } from './caja.js';

describe('montoDescuento', () => {
  it('un porcentaje se redondea al centavo', () => {
    expect(montoDescuento(1234567, { tipo: 'porcentaje', valor: 10 })).toBe(123457);
  });
  it('nunca descuenta más que el subtotal', () => {
    expect(montoDescuento(3000, { tipo: 'monto', valor: 5000 })).toBe(3000);
    expect(montoDescuento(3000, { tipo: 'porcentaje', valor: 150 })).toBe(3000);
  });
  it('un descuento negativo es un error', () => {
    expect(() => montoDescuento(3000, { tipo: 'monto', valor: -1 })).toThrow();
  });
});

describe('resumenTurno', () => {
  it('suma ventas y propinas por método y calcula el efectivo esperado', () => {
    const r = resumenTurno({
      fondo: 1000000,
      pagos: [
        { metodo: 'efectivo', monto: 500000, propina: 50000 },
        { metodo: 'debito', monto: 700000, propina: 0 },
      ],
      movimientos: [
        { tipo: 'egreso', monto: 200000 },
        { tipo: 'ingreso', monto: 100000 },
      ],
    });
    expect(r.ventas).toBe(1200000);
    expect(r.propinas).toBe(50000);
    expect(r.porMetodo.efectivo).toEqual({ ventas: 500000, propinas: 50000 });
    expect(r.porMetodo.debito).toEqual({ ventas: 700000, propinas: 0 });
    expect(r.porMetodo.credito).toEqual({ ventas: 0, propinas: 0 });
    expect(r.ingresos).toBe(100000);
    expect(r.egresos).toBe(200000);
    expect(r.efectivoEsperado).toBe(1450000);
  });
});

it('cada método tiene nombre', () => {
  expect(METODOS_PAGO.map((m) => NOMBRE_METODO[m])).toEqual([
    'Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago', 'Otro',
  ]);
});
