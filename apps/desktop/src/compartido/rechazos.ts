import { formatearPrecio } from '@gula/shared';
import type { OperacionRechazada } from './ipc';

type Datos = Record<string, unknown>;

/** Por qué no quedó, en palabras de la moza. */
const MOTIVOS: Record<string, string> = {
  CAJA_CERRADA: 'la caja ya estaba cerrada',
  CAJA_ABIERTA: 'ya había una caja abierta',
  REQUIERE_AUTORIZACION: 'el PIN de autorización no era válido',
  ESTADO_INVALIDO: 'ya se había cobrado, cerrado o anulado',
  DATOS_INVALIDOS: 'los datos no eran válidos',
  SIN_PERMISO: 'ese usuario no tenía permiso',
  MESA_OCUPADA: 'la mesa ya estaba abierta',
};
const DE_SERVIDOR = new Set(['ERROR_INTERNO', 'ERROR_SERVIDOR']);

const de = (lugar: string | null, sinLugar: string) => (lugar ? `de la ${lugar}` : sinLugar);
const monto = (d: Datos) => formatearPrecio(Number(d.subtotal ?? 0) - Number((d.descuento as { monto?: number } | null)?.monto ?? 0));

/** Qué se intentó hacer (sujeto de la frase) y el verbo de "no quedó". */
const QUE: Record<string, (d: Datos, lugar: string | null) => [string, string]> = {
  'mesa.abrir': (_d, l) => [`No se pudo abrir ${l ? `la ${l}` : 'una mesa'}`, ''],
  'mesa.cerrar': (_d, l) => [`No se pudo cerrar ${l ? `la ${l}` : 'una mesa'}`, ''],
  'pedido.crear': (_d, l) => [`El pedido ${de(l, 'de mostrador')}`, 'no se guardó'],
  'pedido.confirmar': (_d, l) => [`La confirmación del pedido ${de(l, 'de mostrador')}`, 'no se guardó'],
  'cuenta.cobrar': (d, l) => [`El cobro ${de(l, `de ${monto(d)}`)}`, 'no se registró'],
  'caja.abrir': (d) => [`La apertura de caja (fondo ${formatearPrecio(Number(d.fondo ?? 0))})`, 'no se registró'],
  'caja.movimiento': (d) => [`El ${d.tipo === 'ingreso' ? 'ingreso' : 'egreso'} de ${formatearPrecio(Number(d.monto ?? 0))}`, 'no se registró'],
  'caja.cerrar': (d) => [`El cierre de caja (contado ${formatearPrecio(Number(d.contado ?? 0))})`, 'no se registró'],
  'item.anular': (_d, l) => [`La anulación de un ítem ${de(l, 'de un pedido')}`, 'no se registró'],
  'pedido.anular': (_d, l) => [`La anulación del pedido ${de(l, 'de mostrador')}`, 'no se registró'],
  'delivery.crear': () => ['El pedido de delivery', 'no se guardó'],
  'delivery.estado': () => ['El cambio de estado de un delivery', 'no se guardó'],
  'producto.disponibilidad': () => ['El cambio de disponibilidad de un producto', 'no se guardó'],
  'opcion.disponibilidad': () => ['El cambio de disponibilidad de una opción', 'no se guardó'],
};

function motivo(tipo: string, codigo: string): string {
  if (DE_SERVIDOR.has(codigo)) return 'el servidor no pudo aplicarlo; avisá al soporte';
  if (codigo === 'NO_ENCONTRADO')
    return tipo.startsWith('mesa.') || tipo === 'pedido.crear' || tipo === 'cuenta.cobrar' ? 'la mesa ya no existe' : 'ya no existe';
  return MOTIVOS[codigo] ?? `el servidor no lo aceptó (${codigo})`;
}

/** Frase entendible para un cambio que el servidor rechazó. */
export function describirRechazo(op: OperacionRechazada): string {
  const codigo = op.error ?? 'RECHAZADA';
  const que = QUE[op.tipo];
  if (!que) return `Un cambio no se pudo guardar en el servidor (${codigo})${DE_SERVIDOR.has(codigo) ? '; avisá al soporte' : ''}.`;
  const [sujeto, verbo] = que((op.datos ?? {}) as Datos, op.lugar ?? null);
  return `${sujeto}${verbo ? ` ${verbo}` : ''}: ${motivo(op.tipo, codigo)}.`;
}
