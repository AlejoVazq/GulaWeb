import { inArray } from 'drizzle-orm';
import {
  precioUnitario,
  resumirOpciones,
  validarSeleccion,
  type ItemSolicitado,
  type ProductoPublico,
} from '@gula/shared';
import type { Tx } from '../db/cliente.js';
import { productos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { cartaDeLocal } from '../carta/publica.js';

export type ItemArmado = {
  productoId: string;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  seleccion: Record<string, string[]>;
  resumenOpciones: string;
  nota: string;
  sectorId: string | null;
};

const noDisponible = (nombre: string) =>
  new ErrorApi(400, 'PRODUCTO_NO_DISPONIBLE', `"${nombre}" no está disponible en este momento.`);

/**
 * Valida un pedido del cliente contra la carta vigente del local fijado en `tx` y calcula los precios.
 * Nunca usa un precio enviado por el cliente.
 */
export async function armarItems(
  tx: Tx,
  local: { nombre: string; slug: string; marca: unknown },
  items: ItemSolicitado[],
  ahora = new Date(),
): Promise<ItemArmado[]> {
  const carta = await cartaDeLocal(tx, local, ahora);
  const mapa = new Map<string, { producto: ProductoPublico; enHorario: boolean }>();
  for (const c of carta.categorias)
    for (const p of c.productos) mapa.set(p.id, { producto: p, enHorario: c.enHorario });

  const sectores = new Map(
    (
      await tx
        .select({ id: productos.id, sectorId: productos.sectorId })
        .from(productos)
        .where(inArray(productos.id, [...new Set(items.map((i) => i.productoId))]))
    ).map((p) => [p.id, p.sectorId]),
  );

  return items.map((item) => {
    const entrada = mapa.get(item.productoId);
    if (!entrada)
      throw new ErrorApi(
        400,
        'PRODUCTO_NO_DISPONIBLE',
        'Un producto del pedido ya no está en la carta.',
      );
    const { producto, enHorario } = entrada;
    if (!producto.disponible || !enHorario) throw noDisponible(producto.nombre);
    const v = validarSeleccion(producto, item.seleccion);
    if (!v.ok)
      throw new ErrorApi(400, 'DATOS_INVALIDOS', `${producto.nombre}: ${v.errores.join('. ')}`);
    return {
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitario: precioUnitario(producto, item.seleccion),
      cantidad: item.cantidad,
      seleccion: item.seleccion,
      resumenOpciones: resumirOpciones(producto, item.seleccion),
      nota: item.nota,
      sectorId: sectores.get(producto.id) ?? null,
    };
  });
}
