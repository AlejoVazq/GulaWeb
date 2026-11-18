import { isNull } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { categorias, gruposOpciones, opciones, productos, sectores } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import demo from './demo-carta.json' with { type: 'json' };

type OpcionDemo = { nombre: string; recargo?: number; disponible?: boolean };
type GrupoDemo = { nombre: string; min: number; max: number; opciones: OpcionDemo[] };
type ProductoDemo = {
  nombre: string;
  precio: number;
  sector: string;
  descripcion?: string;
  etiquetas?: string[];
  disponible?: boolean;
  grupos?: GrupoDemo[];
};
type CartaDemo = {
  sectores: string[];
  categorias: {
    nombre: string;
    horario?: { desde: string; hasta: string };
    productos: ProductoDemo[];
  }[];
};

/** Carga la carta de demostración (bar porteño) en un local sin productos. */
export async function cargarCartaDemo(
  dbs: Dbs,
  localId: string,
  carta: CartaDemo = demo as CartaDemo,
): Promise<{ categorias: number; productos: number }> {
  return conLocal(dbs.dbApp, localId, async (tx) => {
    const existentes = await tx
      .select({ id: productos.id })
      .from(productos)
      .where(isNull(productos.eliminadoEn))
      .limit(1);
    if (existentes.length)
      throw new ErrorApi(409, 'CARTA_NO_VACIA', 'El local ya tiene productos cargados.');

    const sectorIds = new Map<string, string>();
    for (const [orden, nombre] of carta.sectores.entries()) {
      const id = nuevoId();
      sectorIds.set(nombre, id);
      await tx.insert(sectores).values({ id, localId, nombre, orden });
    }
    let totalProductos = 0;
    for (const [ordenCat, c] of carta.categorias.entries()) {
      const categoriaId = nuevoId();
      await tx.insert(categorias).values({
        id: categoriaId,
        localId,
        nombre: c.nombre,
        orden: ordenCat,
        horarioDesde: c.horario?.desde ?? null,
        horarioHasta: c.horario?.hasta ?? null,
      });
      for (const [ordenProd, p] of c.productos.entries()) {
        const productoId = nuevoId();
        totalProductos++;
        await tx.insert(productos).values({
          id: productoId,
          localId,
          categoriaId,
          sectorId: sectorIds.get(p.sector) ?? null,
          nombre: p.nombre,
          descripcion: p.descripcion ?? null,
          precio: p.precio,
          etiquetas: p.etiquetas ?? [],
          disponible: p.disponible ?? true,
          orden: ordenProd,
        });
        for (const [ordenGrupo, g] of (p.grupos ?? []).entries()) {
          const grupoId = nuevoId();
          await tx.insert(gruposOpciones).values({
            id: grupoId,
            localId,
            productoId,
            nombre: g.nombre,
            min: g.min,
            max: g.max,
            orden: ordenGrupo,
          });
          for (const [ordenOp, o] of g.opciones.entries()) {
            await tx.insert(opciones).values({
              id: nuevoId(),
              localId,
              grupoId,
              nombre: o.nombre,
              recargo: o.recargo ?? 0,
              disponible: o.disponible ?? true,
              orden: ordenOp,
            });
          }
        }
      }
    }
    return { categorias: carta.categorias.length, productos: totalProductos };
  });
}
