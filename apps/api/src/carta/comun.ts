import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Tx } from '../db/cliente.js';
import { ErrorApi } from '../errores.js';

export const noEncontrado = (entidad: string) =>
  new ErrorApi(404, 'NO_ENCONTRADO', `No encontramos ${entidad}.`);

export const datosInvalidos = (mensaje: string) => new ErrorApi(400, 'DATOS_INVALIDOS', mensaje);

export const paramId = z.object({ id: z.uuid() });
export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (HH:MM)');
export const orden = z.number().int().min(0).max(10_000);
export const idsOrden = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

type TablaVigente = PgTable & { id: PgColumn; eliminadoEn: PgColumn };

/** Fila no borrada por id (RLS ya limita al local). 404 si no existe. */
export async function buscarVigente<T extends TablaVigente>(
  tx: Tx,
  tabla: T,
  id: string,
  entidad: string,
  extra?: SQL,
): Promise<T['$inferSelect']> {
  const [fila] = await tx
    .select()
    .from(tabla as PgTable)
    .where(and(eq(tabla.id, id), isNull(tabla.eliminadoEn), extra))
    .for('update');
  if (!fila) throw noEncontrado(entidad);
  return fila as T['$inferSelect'];
}

/** Asigna orden = índice para los ids dados (deben ser del local y vigentes). */
export async function reordenar(
  tx: Tx,
  tabla: TablaVigente & { orden: PgColumn },
  ids: string[],
): Promise<void> {
  for (const [i, id] of ids.entries()) {
    const r = await tx
      .update(tabla)
      .set({ orden: i } as never)
      .where(and(eq(tabla.id, id), isNull(tabla.eliminadoEn)))
      .returning({ id: tabla.id });
    if (!r.length) throw datosInvalidos('La lista incluye elementos que no existen');
  }
}

/** '20:00:00' → '20:00' */
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Nombre base guardado en productos.foto → URLs públicas de las dos variantes. */
export const urlsFoto = (base: string | null) =>
  base ? { chica: `/fotos/${base}-400.webp`, grande: `/fotos/${base}-800.webp` } : null;
