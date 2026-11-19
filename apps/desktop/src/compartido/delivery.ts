import type { EstadoReparto } from '@gula/shared';
import type { Pedido } from './salon';

/** Fila tal como la devuelve GET /sync/salon (camelCase, fechas ISO). */
export type FilaDelivery = {
  id: string;
  pedidoId: string;
  clienteNombre: string;
  telefono: string;
  direccion: string;
  referencias: string;
  costoEnvio: number;
  pagaCon: number | null;
  repartidor: string | null;
  estado: EstadoReparto;
  enCaminoEn: string | null;
  entregadoEn: string | null;
  actualizadoEn: string;
  eliminadoEn: string | null;
};

export type DatosCliente = { nombre: string; telefono: string; direccion: string; referencias: string };

export type Reparto = {
  cliente: DatosCliente;
  costoEnvio: number;
  pagaCon: number | null;
  repartidor: string | null;
  estado: EstadoReparto;
  enCaminoEn: string | null;
  entregadoEn: string | null;
};

/** Un pedido de delivery: `aCobrar` = ítems vigentes + envío. */
export type PedidoDelivery = Pedido & { delivery: Reparto; aCobrar: number };

export type TableroDelivery = {
  preparando: PedidoDelivery[];
  enCamino: PedidoDelivery[];
  /** Entregados y cancelados: solo los del día operativo actual. */
  entregados: PedidoDelivery[];
  cancelados: PedidoDelivery[];
};
