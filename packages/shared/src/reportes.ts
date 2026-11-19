import type { MetodoPago } from './caja.js';

export const TIPOS_PERIODO = ['semana', 'mes', 'trimestre', 'semestre', 'anio', 'personalizado'] as const;
export type TipoPeriodo = (typeof TIPOS_PERIODO)[number];
export const NOMBRE_PERIODO: Record<TipoPeriodo, string> = {
  semana: 'Semana',
  mes: 'Mes',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  anio: 'Año',
  personalizado: 'Personalizado',
};
export const DIAS_MAXIMOS_REPORTE = 366;

/** Días operativos AAAA-MM-DD, ambos incluidos. */
export type Rango = { desde: string; hasta: string };

export type OrigenVenta = 'salon' | 'mostrador' | 'delivery';
export type Reporte = {
  ventas: number;
  cobros: number;
  ticketPromedio: number;
  propinas: number;
  descuentos: number;
  envios: number;
  porMetodo: { metodo: MetodoPago; monto: number; propinas: number }[];
  porOrigen: { origen: OrigenVenta; ventas: number; cobros: number }[];
  porHora: { hora: number; ventas: number; cobros: number }[];
  productos: { productoId: string; nombre: string; cantidad: number; importe: number }[];
  meseros: { usuarioId: string | null; nombre: string; pedidos: number; importe: number }[];
  /** Solo con `reportes.resultado`. */
  egresos?: number;
  ingresos?: number;
  resultado?: number;
};
export const NOMBRE_ORIGEN: Record<OrigenVenta, string> = { salon: 'Salón', mostrador: 'Mostrador', delivery: 'Delivery' };

// Fechas como días en UTC: sin horas ni zonas de por medio.
const aFecha = (d: string) => new Date(`${d}T00:00:00Z`);
const aDia = (f: Date) => f.toISOString().slice(0, 10);
const mas = (d: string, dias: number) => aDia(new Date(aFecha(d).getTime() + dias * 86_400_000));
const finDeMes = (anio: number, mes0: number) => aDia(new Date(Date.UTC(anio, mes0 + 1, 0)));
const inicioMes = (anio: number, mes0: number) => aDia(new Date(Date.UTC(anio, mes0, 1)));
const MESES: Record<'mes' | 'trimestre' | 'semestre' | 'anio', number> = { mes: 1, trimestre: 3, semestre: 6, anio: 12 };

export function periodoQueContiene(tipo: Exclude<TipoPeriodo, 'personalizado'>, dia: string): Rango {
  const f = aFecha(dia);
  if (tipo === 'semana') {
    const lunes = mas(dia, -((f.getUTCDay() + 6) % 7));
    return { desde: lunes, hasta: mas(lunes, 6) };
  }
  const n = MESES[tipo];
  const anio = f.getUTCFullYear();
  const mes0 = Math.floor(f.getUTCMonth() / n) * n;
  return { desde: inicioMes(anio, mes0), hasta: finDeMes(anio, mes0 + n - 1) };
}

export function periodoAnterior(tipo: TipoPeriodo, r: Rango): Rango {
  if (tipo === 'personalizado') {
    const n = diasEntre(r);
    return { desde: mas(r.desde, -n), hasta: mas(r.desde, -1) };
  }
  return periodoQueContiene(tipo, mas(r.desde, -1));
}

/** El período siguiente (para navegar hacia adelante). */
export function periodoSiguiente(tipo: TipoPeriodo, r: Rango): Rango {
  if (tipo === 'personalizado') {
    const n = diasEntre(r);
    return { desde: mas(r.hasta, 1), hasta: mas(r.hasta, n) };
  }
  return periodoQueContiene(tipo, mas(r.hasta, 1));
}

export function diasEntre(r: Rango): number {
  return Math.round((aFecha(r.hasta).getTime() - aFecha(r.desde).getTime()) / 86_400_000) + 1;
}

const esDia = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(aFecha(d).getTime()) && aDia(aFecha(d)) === d;

/** Mensaje para el usuario si el rango no sirve; null si está bien. */
export function rangoValido(r: Rango): string | null {
  if (!esDia(r.desde) || !esDia(r.hasta)) return 'Elegí una fecha válida.';
  if (r.hasta < r.desde) return 'La fecha "hasta" es antes que "desde".';
  if (diasEntre(r) > DIAS_MAXIMOS_REPORTE) return `El período puede tener como máximo ${DIAS_MAXIMOS_REPORTE} días.`;
  return null;
}

/** Variación relativa; null si no hay base para comparar. */
export function variacion(actual: number, anterior: number): number | null {
  return anterior ? (actual - anterior) / anterior : null;
}
