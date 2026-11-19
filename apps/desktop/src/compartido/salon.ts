import type { EstadoPedido, EstadoSesion, OrigenPedido, Seleccion, TipoAviso } from '@gula/shared';

/** Filas tal como las devuelve GET /sync/salon (camelCase, fechas ISO). */
type Base = { id: string; actualizadoEn: string; eliminadoEn: string | null };
export type FilaMesa = Base & {
  nombre: string;
  zona: string | null;
  capacidad: number | null;
  orden: number;
  token: string;
};
export type FilaSesion = Base & {
  mesaId: string;
  estado: EstadoSesion;
  comensales: number | null;
  abiertaPor: string | null;
  abiertaEn: string;
  cerradaPor: string | null;
  cerradaEn: string | null;
};
export type FilaPedido = Base & {
  origen: OrigenPedido;
  estado: EstadoPedido;
  sesionId: string | null;
  mesaId: string | null;
  numero: number | null;
  dia: string | null;
  notas: string | null;
  motivoRechazo: string | null;
  creadoPor: string | null;
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  rechazadoEn: string | null;
  anuladoPor?: string | null;
  motivoAnulacion?: string | null;
  anuladoEn?: string | null;
  creadoEn: string;
};
export type FilaItem = Base & {
  pedidoId: string;
  productoId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  seleccion: Seleccion;
  resumenOpciones: string;
  nota: string;
  sectorId: string | null;
  anulado: boolean;
  anuladoPor?: string | null;
  motivoAnulacion?: string | null;
  anuladoEn?: string | null;
  creadoEn: string;
};
export type FilaAviso = Base & {
  sesionId: string;
  tipo: TipoAviso;
  atendidoPor: string | null;
  atendidoEn: string | null;
  creadoEn: string;
};

export type RespuestaPullSalon = {
  cursor: string;
  mesas: FilaMesa[];
  sesiones: FilaSesion[];
  pedidos: FilaPedido[];
  items: FilaItem[];
  avisos: FilaAviso[];
};

type SinMeta<T> = Omit<T, 'actualizadoEn' | 'eliminadoEn'>;
export type Mesa = SinMeta<FilaMesa>;
export type Sesion = SinMeta<FilaSesion>;
export type Item = SinMeta<FilaItem>;
export type Aviso = SinMeta<FilaAviso>;
/** Pedido con sus ítems vigentes (sin los anulados) y el total. */
export type Pedido = SinMeta<FilaPedido> & { items: Item[]; total: number };

export type MesaSalon = Mesa & { sesion: Sesion | null; pendientes: number; avisos: Aviso[] };
export type PedidoPendiente = Pedido & { mesa: { id: string; nombre: string } | null };
export type AvisoSalon = Aviso & { mesa: { id: string; nombre: string } };
export type Salon = { mesas: MesaSalon[]; pendientes: PedidoPendiente[]; avisos: AvisoSalon[] };
export type DetalleMesa = { mesa: Mesa; sesion: Sesion | null; pedidos: Pedido[]; avisos: Aviso[] };

/** Un ítem tal como viaja en `pedido.crear` (precios del snapshot de la carta de la PC). */
export type ItemNuevo = {
  itemId: string;
  productoId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  seleccion: Seleccion;
  resumenOpciones: string;
  nota: string;
  sectorId: string | null;
};
export type Ajuste = { itemId: string; cantidad: number };
