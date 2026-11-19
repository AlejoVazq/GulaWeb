import type { EstadoPedido } from '@gula/shared';

export type Sello = { texto: 'ENVIADO' | 'CONFIRMADO' | 'RECHAZADO' | 'ANULADO'; tono: 'neutro' | 'ok' | 'mal' };

/** El sello que se estampa en el papel según el estado real del pedido. */
export function selloDeEstado(estado: EstadoPedido): Sello {
  switch (estado) {
    case 'pendiente':
      return { texto: 'ENVIADO', tono: 'neutro' };
    case 'confirmado':
    case 'cobrado':
      return { texto: 'CONFIRMADO', tono: 'ok' };
    case 'rechazado':
      return { texto: 'RECHAZADO', tono: 'mal' };
    case 'anulado':
      return { texto: 'ANULADO', tono: 'mal' };
  }
}
