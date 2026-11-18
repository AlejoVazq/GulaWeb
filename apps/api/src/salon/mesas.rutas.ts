import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { locales, mesas, sesionesMesa } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import * as v from '../validacion.js';
import { buscarVigente, orden, paramId } from '../carta/comun.js';

/** 16 bytes aleatorios → 22 caracteres base64url. */
export const nuevoToken = () => randomBytes(16).toString('base64url');

type Fila = typeof mesas.$inferSelect;
const vista = (m: Fila, slug: string) => ({
  id: m.id,
  nombre: m.nombre,
  zona: m.zona,
  capacidad: m.capacidad,
  orden: m.orden,
  token: m.token,
  url: `/${slug}/m/${m.token}`,
});

const cuerpo = z.object({
  nombre: v.nombre,
  zona: z.string().trim().min(1).max(40).nullable().optional(),
  capacidad: z.number().int().min(1).max(100).nullable().optional(),
  orden: orden.optional(),
});

async function slugDe(tx: Tx, localId: string): Promise<string> {
  const [l] = await tx.select({ slug: locales.slug }).from(locales).where(eq(locales.id, localId));
  return l!.slug;
}

export async function rutasMesas(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('admin.configurar')] };
  app.addHook('onResponse', async (req, reply) => {
    if (req.method !== 'GET' && reply.statusCode < 400 && req.sesion)
      app.avisar(req.sesion.localId, 'salon');
  });

  app.get('/salon/mesas', pre, async (req) =>
    conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const slug = await slugDe(tx, req.sesion.localId);
      const filas = await tx
        .select()
        .from(mesas)
        .where(isNull(mesas.eliminadoEn))
        .orderBy(asc(mesas.orden), asc(mesas.creadoEn));
      return filas.map((m) => vista(m, slug));
    }),
  );

  app.post('/salon/mesas', pre, async (req, reply) => {
    const b = cuerpo.parse(req.body);
    const m = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const [fila] = await tx
        .insert(mesas)
        .values({ id: nuevoId(), localId: req.sesion.localId, token: nuevoToken(), ...b })
        .returning();
      return vista(fila!, await slugDe(tx, req.sesion.localId));
    });
    return reply.status(201).send(m);
  });

  app.patch('/salon/mesas/:id', pre, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpo.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, mesas, id, 'esa mesa');
      const [m] = await tx.update(mesas).set(b).where(eq(mesas.id, id)).returning();
      return vista(m!, await slugDe(tx, req.sesion.localId));
    });
  });

  app.post('/salon/mesas/:id/regenerar-token', pre, async (req) => {
    const { id } = paramId.parse(req.params);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, mesas, id, 'esa mesa');
      const [m] = await tx
        .update(mesas)
        .set({ token: nuevoToken() })
        .where(eq(mesas.id, id))
        .returning();
      return vista(m!, await slugDe(tx, req.sesion.localId));
    });
  });

  app.delete('/salon/mesas/:id', pre, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, mesas, id, 'esa mesa');
      const [ocupada] = await tx
        .select({ id: sesionesMesa.id })
        .from(sesionesMesa)
        .where(and(eq(sesionesMesa.mesaId, id), ne(sesionesMesa.estado, 'cerrada')));
      if (ocupada)
        throw new ErrorApi(409, 'MESA_OCUPADA', 'La mesa está abierta. Cerrala antes de borrarla.');
      await tx.update(mesas).set({ eliminadoEn: new Date() }).where(eq(mesas.id, id));
    });
    return reply.status(204).send();
  });
}
