export const METODOS_PAGO = ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];
export const NOMBRE_METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  otro: 'Otro',
};

export const CATEGORIAS_MOVIMIENTO = ['proveedores', 'sueldos', 'retiro', 'otro'] as const;
export type CategoriaMovimiento = (typeof CATEGORIAS_MOVIMIENTO)[number];
export const NOMBRE_CATEGORIA: Record<CategoriaMovimiento, string> = {
  proveedores: 'Proveedores',
  sueldos: 'Sueldos',
  retiro: 'Retiro',
  otro: 'Otro',
};
export type TipoMovimiento = 'ingreso' | 'egreso';

export const MOTIVO_MAXIMO = 140;
export const PAGOS_MAXIMOS = 10;

/** Descuento en centavos: un porcentaje se redondea al centavo; nunca supera el subtotal. */
export function montoDescuento(subtotal: number, d: { tipo: 'monto' | 'porcentaje'; valor: number }): number {
  if (!Number.isFinite(d.valor) || d.valor < 0) throw new Error('El descuento no puede ser negativo.');
  const monto = d.tipo === 'porcentaje' ? Math.round((subtotal * Math.min(d.valor, 100)) / 100) : Math.round(d.valor);
  return Math.min(monto, subtotal);
}

export type ResumenTurno = {
  porMetodo: Record<MetodoPago, { ventas: number; propinas: number }>;
  ventas: number;
  propinas: number;
  ingresos: number;
  egresos: number;
  efectivoEsperado: number;
};

/** Arqueo del turno: lo usan la PC (lo que ve la cajera) y el servidor (lo que queda guardado). */
export function resumenTurno(t: {
  fondo: number;
  pagos: { metodo: MetodoPago; monto: number; propina: number }[];
  movimientos: { tipo: TipoMovimiento; monto: number }[];
}): ResumenTurno {
  const porMetodo = Object.fromEntries(METODOS_PAGO.map((m) => [m, { ventas: 0, propinas: 0 }])) as ResumenTurno['porMetodo'];
  for (const p of t.pagos) {
    porMetodo[p.metodo].ventas += p.monto;
    porMetodo[p.metodo].propinas += p.propina;
  }
  const suma = (tipo: TipoMovimiento) => t.movimientos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0);
  const ingresos = suma('ingreso');
  const egresos = suma('egreso');
  return {
    porMetodo,
    ventas: t.pagos.reduce((s, p) => s + p.monto, 0),
    propinas: t.pagos.reduce((s, p) => s + p.propina, 0),
    ingresos,
    egresos,
    efectivoEsperado: t.fondo + porMetodo.efectivo.ventas + porMetodo.efectivo.propinas + ingresos - egresos,
  };
}

/** Tope de montos de caja en centavos ($ 1.000 millones): muy por encima de un turno real y dentro de lo exacto en JS. */
export const MONTO_MAXIMO_CAJA = 100_000_000_000;
