import type { FastifyInstance } from 'fastify';
import { gt, inArray, isNull, or } from 'drizzle-orm';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { cobros, movimientosCaja, pagos, turnosCaja } from '../db/schema/index.js';
import { cambiados, desdeConSolape, sinLocal, tomarCursor } from '../sync/rutas.js';

const VENTANA_MS = 24 * 3_600_000;

/** Pull completo: la caja abierta y las cerradas en las últimas 24 h, con lo suyo. */
async function cajaCompleta(tx: Tx) {
  const limite = new Date(Date.now() - VENTANA_MS);
  const ts = await tx.select().from(turnosCaja).where(or(isNull(turnosCaja.cerradoEn), gt(turnosCaja.cerradoEn, limite)));
  const ids = ts.map((t) => t.id);
  if (!ids.length) return { ts, cs: [], ps: [], ms: [] };
  return {
    ts,
    cs: await tx.select().from(cobros).where(inArray(cobros.turnoId, ids)),
    ps: await tx.select().from(pagos).where(inArray(pagos.turnoId, ids)),
    ms: await tx.select().from(movimientosCaja).where(inArray(movimientosCaja.turnoId, ids)),
  };
}

async function cajaDesde(tx: Tx, desde: Date) {
  return {
    ts: await cambiados(tx, turnosCaja, desde),
    cs: await cambiados(tx, cobros, desde),
    ps: await cambiados(tx, pagos, desde),
    ms: await cambiados(tx, movimientosCaja, desde),
  };
}

/** Lo pide el motor con el usuario que esté activo en la PC (puede ser una moza): permiso `pedido.ver`. */
export async function rutasPullCaja(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('pedido.ver')] };
  app.get('/sync/caja', pre, async (req) => {
    const desde = desdeConSolape(req.query);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const cursor = await tomarCursor(tx);
      const d = desde ? await cajaDesde(tx, desde) : await cajaCompleta(tx);
      return {
        cursor,
        turnos: d.ts.map(sinLocal),
        cobros: d.cs.map(sinLocal),
        pagos: d.ps.map(sinLocal),
        movimientos: d.ms.map(sinLocal),
      };
    });
  });
}
