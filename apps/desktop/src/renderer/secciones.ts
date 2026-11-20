import type { TableroDelivery } from '../compartido/delivery';
import type { MesaSalon } from '../compartido/salon';

export type Seccion = 'mesas' | 'delivery' | 'caja' | 'reportes' | 'carta' | 'impresion';

/** Cada sección es una "línea": su color va en el cartel y en la muestra del riel. */
/** `texto` es el color de letra sobre el color de la línea (el ocre de Caja pide tinta). */
export const SECCIONES: Record<Seccion, { nombre: string; color: string; texto: string; placa: string; textoPlaca: string }> = {
  mesas: { nombre: 'Mesas', color: '#16583d', texto: '#ffffff', placa: '#efe3bf', textoPlaca: '#16583d' },
  delivery: { nombre: 'Delivery', color: '#1c4c97', texto: '#ffffff', placa: '#e4ecf8', textoPlaca: '#1c4c97' },
  caja: { nombre: 'Caja', color: '#d79a17', texto: '#15171a', placa: '#15171a', textoPlaca: '#f7d27a' },
  reportes: { nombre: 'Reportes', color: '#6e1c38', texto: '#ffffff', placa: '#f3dfe6', textoPlaca: '#6e1c38' },
  carta: { nombre: 'Carta', color: '#11606b', texto: '#ffffff', placa: '#dcf0f2', textoPlaca: '#11606b' },
  impresion: { nombre: 'Impresión', color: '#3d4249', texto: '#ffffff', placa: '#e6e8ea', textoPlaca: '#3d4249' },
};

/** Colores reservados para estados: nunca se usan como color de sección. */
export const COLOR_ESTADO = { urgente: '#d8361b', cuenta: '#f0b429' } as const;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que dice el cartel de Mesas: la placa es la cantidad de mesas. */
export function resumenMesas(mesas: MesaSalon[]): { placa: string; resumen: string } {
  const abiertas = mesas.filter((m) => m.sesion).length;
  const cuenta = mesas.filter((m) => m.sesion && (m.sesion.estado === 'cuenta_pedida' || m.avisos.some((a) => a.tipo === 'cuenta'))).length;
  const pendientes = mesas.reduce((n, m) => n + m.pendientes, 0);
  const partes = [
    abiertas && plural(abiertas, 'abierta', 'abiertas'),
    cuenta && plural(cuenta, 'pidió la cuenta', 'pidieron la cuenta'),
    pendientes && plural(pendientes, 'pedido sin atender', 'pedidos sin atender'),
  ].filter(Boolean);
  return { placa: String(mesas.length), resumen: partes.length ? partes.join(' · ') : 'Todas libres' };
}

/** Cartel de Delivery: la placa son los pedidos en curso (preparando + en camino). */
export function resumenDelivery(t: TableroDelivery | null): { placa: string; resumen?: string } {
  if (!t) return { placa: '0' };
  const activos = [...t.preparando, ...t.enCamino];
  const aCobrar = activos.filter((p) => p.estado !== 'cobrado').length;
  const partes = [
    t.preparando.length && `${t.preparando.length} preparando`,
    t.enCamino.length && `${t.enCamino.length} en camino`,
    aCobrar && `${aCobrar} a cobrar`,
  ].filter(Boolean);
  return { placa: String(activos.length), resumen: partes.length ? partes.join(' · ') : 'Nada en curso' };
}
