export const ESTADOS_REPARTO = ['preparando', 'en_camino', 'entregado'] as const;
export type EstadoReparto = (typeof ESTADOS_REPARTO)[number];
export const NOMBRE_ESTADO_REPARTO: Record<EstadoReparto, string> = {
  preparando: 'Preparando',
  en_camino: 'En camino',
  entregado: 'Entregado',
};

/** Largo máximo de cada dato del cliente y del repartidor. */
export const LIMITES_DELIVERY = { nombre: 80, telefono: 30, direccion: 200, referencias: 140, repartidor: 60 } as const;

/** El reparto solo avanza (se puede saltar de preparando a entregado). */
export function avanzaReparto(actual: EstadoReparto, nuevo: EstadoReparto): boolean {
  return ESTADOS_REPARTO.indexOf(nuevo) > ESTADOS_REPARTO.indexOf(actual);
}

/** Lo que el repartidor tiene que llevar de cambio; null si no se sabe con cuánto paga o paga con menos. */
export function vuelto(total: number, pagaCon: number | null): number | null {
  if (pagaCon == null || pagaCon < total) return null;
  return pagaCon - total;
}
