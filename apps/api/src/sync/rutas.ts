import type { FastifyInstance } from 'fastify';
import { gt, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { categorias, gruposOpciones, opciones, productos, sectores } from '../db/schema/index.js';
import { hhmm, urlsFoto } from '../carta/comun.js';
import { esquemaLote, procesarLote } from './operaciones.js';
import './tiposCarta.js';
import '../salon/operaciones.js';
import '../caja/operaciones.js';

/** Solape del pull: un commit puede llegar después con un actualizado_en anterior al cursor. */
export const SOLAPE_MS = 30_000;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function sinLocal<
  T extends { localId: string; creadoEn: Date; actualizadoEn: Date; eliminadoEn: Date | null },
>(f: T) {
  const { localId: _l, creadoEn, actualizadoEn, eliminadoEn, ...resto } = f;
  return {
    ...resto,
    creadoEn: iso(creadoEn),
    actualizadoEn: iso(actualizadoEn),
    eliminadoEn: iso(eliminadoEn),
  };
}

export async function cambiados<T extends PgTable & { actualizadoEn: PgColumn }>(
  tx: Tx,
  tabla: T,
  desde: Date | null,
) {
  const filtro: SQL | undefined = desde ? gt(tabla.actualizadoEn, desde) : undefined;
  return tx
    .select()
    .from(tabla as PgTable)
    .where(filtro) as Promise<T['$inferSelect'][]>;
}

/** El cursor se toma antes de leer: lo que se escriba durante la lectura entra en el próximo pull. */
export async function tomarCursor(tx: Tx): Promise<string> {
  const [{ ahora }] = (await tx.execute(sql`select clock_timestamp() as ahora`)) as unknown as [
    { ahora: Date | string },
  ];
  return new Date(ahora).toISOString();
}

/** `?desde=` menos el solape, o null para un pull completo. */
export function desdeConSolape(query: unknown): Date | null {
  const q = z
    .object({ desde: z.iso.datetime({ offset: true }).optional().or(z.literal('')) })
    .parse(query);
  return q.desde ? new Date(new Date(q.desde).getTime() - SOLAPE_MS) : null;
}

export async function leerCambiosCarta(tx: Tx, desde: Date | null) {
  const [secs, cats, prods, grupos, ops] = [
    await cambiados(tx, sectores, desde),
    await cambiados(tx, categorias, desde),
    await cambiados(tx, productos, desde),
    await cambiados(tx, gruposOpciones, desde),
    await cambiados(tx, opciones, desde),
  ];
  return {
    sectores: secs.map(sinLocal),
    categorias: cats.map((c) => ({
      ...sinLocal(c),
      horarioDesde: hhmm(c.horarioDesde),
      horarioHasta: hhmm(c.horarioHasta),
    })),
    productos: prods.map((p) => ({ ...sinLocal(p), foto: urlsFoto(p.foto) })),
    grupos: grupos.map(sinLocal),
    opciones: ops.map(sinLocal),
  };
}

export async function rutasSync(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('pedido.ver')] };

  app.get('/sync/carta', pre, async (req) => {
    const desde = desdeConSolape(req.query);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const cursor = await tomarCursor(tx);
      return { cursor, ...(await leerCambiosCarta(tx, desde)) };
    });
  });

  app.post(
    '/sync/operaciones',
    { preHandler: app.autenticar, bodyLimit: 1024 * 1024 },
    async (req) => {
      const { operaciones } = esquemaLote.parse(req.body);
      const { resultados, temas } = await procesarLote(dbs, req.sesion, operaciones);
      for (const t of temas) app.avisar(req.sesion.localId, t);
      return { resultados };
    },
  );
}
