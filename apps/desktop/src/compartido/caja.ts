import type { CategoriaMovimiento, MetodoPago, ResumenTurno, TipoMovimiento } from '@gula/shared';

/** Filas tal como las devuelve GET /sync/caja (camelCase, fechas ISO). */
type Base = { id: string; actualizadoEn: string; eliminadoEn: string | null };
export type FilaTurno = Base & {
  abiertoPor: string;
  abiertoEn: string;
  fondo: number;
  cerradoPor: string | null;
  cerradoEn: string | null;
  contado: number | null;
  esperado: number | null;
  diferencia: number | null;
  notas: string | null;
};
export type FilaCobro = Base & {
  turnoId: string;
  sesionId: string | null;
  pedidoId: string | null;
  subtotal: number;
  descuento: number;
  motivoDescuento: string | null;
  total: number;
  cobradoPor: string;
  cobradoEn: string;
};
export type FilaPago = Base & { cobroId: string; turnoId: string; metodo: MetodoPago; monto: number; propina: number };
export type FilaMovimiento = Base & {
  turnoId: string;
  tipo: TipoMovimiento;
  categoria: CategoriaMovimiento;
  monto: number;
  motivo: string;
  usuarioId: string;
  hechoEn: string;
};
export type RespuestaPullCaja = {
  cursor: string;
  turnos: FilaTurno[];
  cobros: FilaCobro[];
  pagos: FilaPago[];
  movimientos: FilaMovimiento[];
};

type SinMeta<T> = Omit<T, 'actualizadoEn' | 'eliminadoEn'>;
export type Turno = SinMeta<FilaTurno>;
export type Pago = SinMeta<FilaPago>;
export type Movimiento = SinMeta<FilaMovimiento>;
export type Cobro = SinMeta<FilaCobro> & { pagos: Pago[]; destino: string };
export type EstadoCaja = {
  turno: Turno | null;
  resumen: ResumenTurno | null;
  movimientos: Movimiento[];
  cobros: Cobro[];
  ultimoCierre: Turno | null;
};
export type PagoNuevo = { metodo: MetodoPago; monto: number; propina: number };
