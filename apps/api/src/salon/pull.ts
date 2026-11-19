import type { FastifyInstance } from 'fastify';
import { and, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { avisosMesa, itemsPedido, mesas, pedidos, sesionesMesa } from '../db/schema/index.js';
import { cambiados, desdeConSolape, sinLocal, tomarCursor } from '../sync/rutas.js';

const VENTANA_MS = 24 * 3_600_000;

/** Pull completo: mesas, lo abierto y lo cerrado en las últimas 24 h (lo anterior es historia, no salón). */
async function salonCompleto(tx: Tx) {
  const limite = new Date(Date.now() - VENTANA_MS);
  const ms = await tx.select().from(mesas);
  const ses = await tx
    .select()
    .from(sesionesMesa)
    .where(or(ne(sesionesMesa.estado, 'cerrada'), gt(sesionesMesa.cerradaEn, limite)));
  const idsSesion = ses.map((s) => s.id);
  const peds = await tx
    .select()
    .from(pedidos)
    .where(
      or(
        idsSesion.length ? inArray(pedidos.sesionId, idsSesion) : undefined,
        and(isNull(pedidos.sesionId), gt(pedidos.creadoEn, limite)),
      ),
    );
  const idsPedido = peds.map((p) => p.id);
  const items = idsPedido.length
    ? await tx.select().from(itemsPedido).where(inArray(itemsPedido.pedidoId, idsPedido))
    : [];
  const avisos = idsSesion.length
    ? await tx.select().from(avisosMesa).where(inArray(avisosMesa.sesionId, idsSesion))
    : [];
  return { ms, ses, peds, items, avisos };
}

async function salonDesde(tx: Tx, desde: Date) {
  return {
    ms: await cambiados(tx, mesas, desde),
    ses: await cambiados(tx, sesionesMesa, desde),
    peds: await cambiados(tx, pedidos, desde),
    items: await cambiados(tx, itemsPedido, desde),
    avisos: await cambiados(tx, avisosMesa, desde),
  };
}

export async function leerCambiosSalon(tx: Tx, desde: Date | null) {
  const d = desde ? await salonDesde(tx, desde) : await salonCompleto(tx);
  return {
    mesas: d.ms.map(sinLocal),
    sesiones: d.ses.map(sinLocal),
    pedidos: d.peds.map(sinLocal),
    items: d.items.map(sinLocal),
    avisos: d.avisos.map(sinLocal),
  };
}

export async function rutasPullSalon(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('pedido.ver')] };
  app.get('/sync/salon', pre, async (req) => {
    const desde = desdeConSolape(req.query);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const cursor = await tomarCursor(tx);
      return { cursor, ...(await leerCambiosSalon(tx, desde)) };
    });
  });
}
