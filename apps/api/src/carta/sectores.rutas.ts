import type { FastifyInstance } from 'fastify';
import { avisarCambiosDeCarta } from '../tiempoReal/avisar.js';
import { asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { sectores } from '../db/schema/index.js';
import * as v from '../validacion.js';
import { buscarVigente, orden, paramId } from './comun.js';

type Fila = typeof sectores.$inferSelect;
const vista = (s: Fila) => ({ id: s.id, nombre: s.nombre, orden: s.orden });
const cuerpo = z.object({ nombre: v.nombre, orden: orden.optional() });

export async function rutasSectores(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  avisarCambiosDeCarta(app);
  const pre = { preHandler: [app.autenticar, app.requierePermiso('carta.editar')] };

  app.get('/carta/sectores', pre, async (req) =>
    conLocal(dbs.dbApp, req.sesion.localId, async (tx) =>
      (
        await tx
          .select()
          .from(sectores)
          .where(isNull(sectores.eliminadoEn))
          .orderBy(asc(sectores.orden), asc(sectores.nombre))
      ).map(vista),
    ),
  );

  app.post('/carta/sectores', pre, async (req, reply) => {
    const b = cuerpo.parse(req.body);
    const [s] = await conLocal(dbs.dbApp, req.sesion.localId, (tx) =>
      tx
        .insert(sectores)
        .values({ id: nuevoId(), localId: req.sesion.localId, ...b })
        .returning(),
    );
    return reply.status(201).send(vista(s!));
  });

  app.patch('/carta/sectores/:id', pre, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpo.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, sectores, id, 'ese sector');
      const [s] = await tx.update(sectores).set(b).where(eq(sectores.id, id)).returning();
      return vista(s!);
    });
  });

  app.delete('/carta/sectores/:id', pre, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, sectores, id, 'ese sector');
      await tx.update(sectores).set({ eliminadoEn: new Date() }).where(eq(sectores.id, id));
    });
    return reply.status(204).send();
  });
}
