import type { FastifyInstance } from 'fastify';
import { avisarCambiosDeCarta } from '../tiempoReal/avisar.js';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { categorias, productos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import * as v from '../validacion.js';
import { buscarVigente, hhmm, hora, idsOrden, orden, paramId, reordenar } from './comun.js';

type Fila = typeof categorias.$inferSelect;
export const vistaCategoria = (c: Fila) => ({
  id: c.id,
  nombre: c.nombre,
  orden: c.orden,
  visible: c.visible,
  horario:
    c.horarioDesde && c.horarioHasta
      ? { desde: hhmm(c.horarioDesde)!, hasta: hhmm(c.horarioHasta)! }
      : null,
});

const cuerpo = z.object({
  nombre: v.nombre,
  orden: orden.optional(),
  visible: z.boolean().optional(),
  horario: z
    .object({ desde: hora, hasta: hora })
    .refine((h) => h.desde !== h.hasta, 'El horario no puede empezar y terminar a la misma hora')
    .nullable()
    .optional(),
});

const aColumnas = ({ horario, ...resto }: Partial<z.infer<typeof cuerpo>>) => ({
  ...resto,
  ...(horario === undefined
    ? {}
    : { horarioDesde: horario?.desde ?? null, horarioHasta: horario?.hasta ?? null }),
});

export async function rutasCategorias(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  avisarCambiosDeCarta(app);
  const pre = { preHandler: [app.autenticar, app.requierePermiso('carta.editar')] };

  app.get('/carta/categorias', pre, async (req) =>
    conLocal(dbs.dbApp, req.sesion.localId, async (tx) =>
      (
        await tx
          .select()
          .from(categorias)
          .where(isNull(categorias.eliminadoEn))
          .orderBy(asc(categorias.orden), asc(categorias.nombre))
      ).map(vistaCategoria),
    ),
  );

  app.post('/carta/categorias', pre, async (req, reply) => {
    const b = cuerpo.parse(req.body);
    const [c] = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const existentes = await tx
        .select({ id: categorias.id })
        .from(categorias)
        .where(isNull(categorias.eliminadoEn));
      return tx
        .insert(categorias)
        .values({
          id: nuevoId(),
          localId: req.sesion.localId,
          orden: existentes.length,
          ...aColumnas(b),
          nombre: b.nombre,
        })
        .returning();
    });
    return reply.status(201).send(vistaCategoria(c!));
  });

  app.put('/carta/categorias/orden', pre, async (req, reply) => {
    const { ids } = idsOrden.parse(req.body);
    await conLocal(dbs.dbApp, req.sesion.localId, (tx) => reordenar(tx, categorias, ids));
    return reply.status(204).send();
  });

  app.patch('/carta/categorias/:id', pre, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpo.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const actual = await buscarVigente(tx, categorias, id, 'esa categoría');
      const cambios = aColumnas(b);
      if (!Object.keys(cambios).length) return vistaCategoria(actual);
      const [c] = await tx.update(categorias).set(cambios).where(eq(categorias.id, id)).returning();
      return vistaCategoria(c!);
    });
  });

  app.delete('/carta/categorias/:id', pre, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, categorias, id, 'esa categoría');
      const conProductos = await tx
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.categoriaId, id), isNull(productos.eliminadoEn)))
        .limit(1);
      if (conProductos.length) {
        throw new ErrorApi(
          409,
          'CATEGORIA_CON_PRODUCTOS',
          'Primero mové o borrá los productos de esta categoría.',
        );
      }
      await tx.update(categorias).set({ eliminadoEn: new Date() }).where(eq(categorias.id, id));
    });
    return reply.status(204).send();
  });
}
