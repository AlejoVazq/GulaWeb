import type { Rol } from './roles.js';

export const ACCIONES = [
  'mesa.operar',
  'pedido.tomar',
  'pedido.confirmar',
  'pedido.ver',
  'comanda.imprimir',
  'impresion.configurar',
  'delivery.gestionar',
  'carta.disponibilidad',
  'cobro.registrar',
  'pedido.anular',
  'pedido.descuento',
  'caja.operar',
  'carta.editar',
  'reportes.ver',
  'reportes.resultado',
  'admin.configurar',
] as const;

export type Accion = (typeof ACCIONES)[number];
export type Permiso = 'si' | 'no' | 'con_autorizacion';

const todos: Record<Rol, Permiso> = { mesero: 'si', encargado: 'si', dueno: 'si' };
const gestion: Record<Rol, Permiso> = { mesero: 'no', encargado: 'si', dueno: 'si' };
const supervisado: Record<Rol, Permiso> = { mesero: 'con_autorizacion', encargado: 'si', dueno: 'si' };
const soloDueno: Record<Rol, Permiso> = { mesero: 'no', encargado: 'no', dueno: 'si' };

/** Matriz de permisos (spec §10). */
const MATRIZ = {
  'mesa.operar': todos,
  'pedido.tomar': todos,
  'pedido.confirmar': todos,
  'pedido.ver': todos,
  'comanda.imprimir': todos,
  'impresion.configurar': gestion,
  'delivery.gestionar': todos,
  'carta.disponibilidad': todos,
  'cobro.registrar': gestion,
  'pedido.anular': supervisado,
  'pedido.descuento': supervisado,
  'caja.operar': gestion,
  'carta.editar': gestion,
  'reportes.ver': gestion,
  'reportes.resultado': soloDueno,
  'admin.configurar': soloDueno,
} satisfies Record<Accion, Record<Rol, Permiso>>;

export function puede(rol: Rol, accion: Accion): Permiso {
  return MATRIZ[accion][rol];
}
