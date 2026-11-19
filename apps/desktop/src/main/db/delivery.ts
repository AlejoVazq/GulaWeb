import { diaOperativo, type EstadoReparto } from '@gula/shared';
import type { DatosCliente, PedidoDelivery, TableroDelivery } from '../../compartido/delivery';
import type { ItemNuevo } from '../../compartido/salon';
import type { BaseLocal } from './base';
import { conItems, crearPedidoLocal, type F } from './salon';

/** Las filas creadas en la PC pierden contra cualquier versión del servidor. */
const LOCAL = '';

type Nuevo = {
  pedidoId: string;
  numero: number;
  dia: string;
  notas: string | null;
  items: ItemNuevo[];
  cliente: DatosCliente;
  costoEnvio: number;
  pagaCon: number | null;
  usuarioId: string;
  ahora: Date;
};

export function crearDeliveryLocal(base: BaseLocal, d: Nuevo): void {
  base.transaccion(() => {
    crearPedidoLocal(base, { ...d, origen: 'delivery', sesionId: null });
    base.db
      .prepare(
        `INSERT INTO deliveries (id, pedido_id, cliente_nombre, telefono, direccion, referencias, costo_envio, paga_con,
           estado, actualizado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparando', ?)`,
      )
      .run(
        d.pedidoId, d.pedidoId, d.cliente.nombre, d.cliente.telefono, d.cliente.direccion, d.cliente.referencias,
        d.costoEnvio, d.pagaCon, LOCAL,
      );
  });
}

export function estadoDeliveryLocal(
  base: BaseLocal,
  d: { pedidoId: string; estado: Exclude<EstadoReparto, 'preparando'>; repartidor: string | null; ahora: Date },
): void {
  const columna = d.estado === 'en_camino' ? 'en_camino_en' : 'entregado_en';
  base.db
    .prepare(`UPDATE deliveries SET estado = ?, ${columna} = ?, repartidor = coalesce(?, repartidor) WHERE id = ?`)
    .run(d.estado, d.ahora.toISOString(), d.repartidor, d.pedidoId);
}

function armar(base: BaseLocal, filas: F[]): PedidoDelivery[] {
  const porId = new Map(filas.map((f) => [f.id as string, f]));
  return conItems(base, filas).map((p) => {
    const f = porId.get(p.id)!;
    const costoEnvio = f.costo_envio as number;
    return {
      ...p,
      delivery: {
        cliente: {
          nombre: f.cliente_nombre as string,
          telefono: f.telefono as string,
          direccion: f.direccion as string,
          referencias: f.referencias as string,
        },
        costoEnvio,
        pagaCon: (f.paga_con as number | null) ?? null,
        repartidor: (f.repartidor as string | null) ?? null,
        estado: f.d_estado as EstadoReparto,
        enCaminoEn: (f.en_camino_en as string | null) ?? null,
        entregadoEn: (f.entregado_en as string | null) ?? null,
      },
      aCobrar: p.total + costoEnvio,
    };
  });
}

const CONSULTA = `SELECT p.*, d.cliente_nombre, d.telefono, d.direccion, d.referencias, d.costo_envio, d.paga_con,
    d.repartidor, d.estado AS d_estado, d.en_camino_en, d.entregado_en
  FROM pedidos p JOIN deliveries d ON d.id = p.id
  WHERE p.eliminado_en IS NULL AND d.eliminado_en IS NULL`;

export function leerDelivery(base: BaseLocal, pedidoId: string): PedidoDelivery | null {
  const f = base.db.prepare(`${CONSULTA} AND p.id = ?`).get(pedidoId) as F | undefined;
  return f ? armar(base, [f])[0]! : null;
}

/** Lo activo (sin importar el día) y lo terminado del día operativo actual. */
export function leerTablero(base: BaseLocal, ahora: Date): TableroDelivery {
  const hoy = diaOperativo(ahora);
  const filas = base.db
    .prepare(
      `${CONSULTA} AND ((p.estado <> 'anulado' AND d.estado <> 'entregado') OR p.dia = ?)
       ORDER BY p.creado_en, p.id`,
    )
    .all(hoy) as F[];
  const todos = armar(base, filas);
  const vivos = todos.filter((p) => p.estado !== 'anulado');
  return {
    preparando: vivos.filter((p) => p.delivery.estado === 'preparando'),
    enCamino: vivos.filter((p) => p.delivery.estado === 'en_camino'),
    entregados: vivos.filter((p) => p.delivery.estado === 'entregado'),
    cancelados: todos.filter((p) => p.estado === 'anulado'),
  };
}

/** Los datos del último delivery con ese teléfono (para no volver a preguntar la dirección). */
export function buscarCliente(base: BaseLocal, telefono: string): DatosCliente | null {
  const t = telefono.trim();
  if (!t) return null;
  const f = base.db
    .prepare(
      `SELECT d.cliente_nombre, d.telefono, d.direccion, d.referencias FROM deliveries d JOIN pedidos p ON p.id = d.id
       WHERE d.telefono = ? AND d.eliminado_en IS NULL ORDER BY p.creado_en DESC LIMIT 1`,
    )
    .get(t) as F | undefined;
  if (!f) return null;
  return {
    nombre: f.cliente_nombre as string,
    telefono: f.telefono as string,
    direccion: f.direccion as string,
    referencias: f.referencias as string,
  };
}
