import { and, asc, inArray, isNull } from 'drizzle-orm';
import type { Tx } from '../db/cliente.js';
import { gruposOpciones, opciones } from '../db/schema/index.js';

export type Grupo = typeof gruposOpciones.$inferSelect;
export type Opcion = typeof opciones.$inferSelect;

export const vistaOpcion = (o: Opcion) => ({
  id: o.id,
  nombre: o.nombre,
  recargo: o.recargo,
  disponible: o.disponible,
  orden: o.orden,
});
export const vistaGrupo = (g: Grupo, ops: Opcion[] = []) => ({
  id: g.id,
  nombre: g.nombre,
  min: g.min,
  max: g.max,
  orden: g.orden,
  opciones: ops.map(vistaOpcion),
});

/** Grupos vigentes (con sus opciones vigentes, ordenadas) agrupados por producto. */
export async function gruposPorProducto(tx: Tx, productoIds: string[]) {
  const mapa = new Map<string, ReturnType<typeof vistaGrupo>[]>();
  if (!productoIds.length) return mapa;
  const grupos = await tx
    .select()
    .from(gruposOpciones)
    .where(and(inArray(gruposOpciones.productoId, productoIds), isNull(gruposOpciones.eliminadoEn)))
    .orderBy(asc(gruposOpciones.orden), asc(gruposOpciones.creadoEn));
  const ops = grupos.length
    ? await tx
        .select()
        .from(opciones)
        .where(
          and(
            inArray(
              opciones.grupoId,
              grupos.map((g) => g.id),
            ),
            isNull(opciones.eliminadoEn),
          ),
        )
        .orderBy(asc(opciones.orden), asc(opciones.creadoEn))
    : [];
  for (const g of grupos) {
    const lista = mapa.get(g.productoId) ?? [];
    lista.push(
      vistaGrupo(
        g,
        ops.filter((o) => o.grupoId === g.id),
      ),
    );
    mapa.set(g.productoId, lista);
  }
  return mapa;
}
