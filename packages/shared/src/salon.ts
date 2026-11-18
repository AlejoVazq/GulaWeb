import type { ProductoPublico, Seleccion } from './carta.js';

export type EstadoPedido = 'pendiente' | 'confirmado' | 'rechazado' | 'anulado';
export type OrigenPedido = 'qr' | 'manual' | 'mostrador';
export type EstadoSesion = 'abierta' | 'cuenta_pedida' | 'cerrada';
export type TipoAviso = 'llamar' | 'cuenta';

export const CANTIDAD_MAXIMA = 50;
export const NOTA_MAXIMA = 140;
export const ITEMS_MAXIMOS = 30;

/** Lo que pide el cliente: nunca lleva precios (los calcula quien recibe). */
export type ItemSolicitado = { productoId: string; seleccion: Seleccion; nota: string; cantidad: number };

export type MotivoSinPedidos = 'mesa_cerrada' | 'local_sin_conexion';

export type MesaPublica = {
  mesa: { nombre: string };
  local: { nombre: string; slug: string };
  aceptaPedidos: boolean;
  motivo: MotivoSinPedidos | null;
};

export type PedidoPublico = {
  id: string;
  estado: EstadoPedido;
  motivoRechazo: string | null;
  total: number;
  items: { nombre: string; cantidad: number; resumenOpciones: string; subtotal: number }[];
};

const ZONA = 'America/Argentina/Buenos_Aires';
const CORTE_HORAS = 6;
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día de trabajo (AAAA-MM-DD) en Buenos Aires; la noche hasta las 06:00 cuenta como el día anterior. */
export function diaOperativo(fecha: Date): string {
  return formatoDia.format(new Date(fecha.getTime() - CORTE_HORAS * 3_600_000));
}

/** Nombres de las opciones elegidas, en el orden de la carta, separados por coma. */
export function resumirOpciones(producto: ProductoPublico, sel: Seleccion): string {
  const nombres: string[] = [];
  for (const g of producto.grupos) {
    const elegidas = new Set(sel[g.id] ?? []);
    for (const o of g.opciones) if (elegidas.has(o.id)) nombres.push(o.nombre);
  }
  return nombres.join(', ');
}
