import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { gruposOpciones, opciones, productos } from '../db/schema/index.js';
import * as v from '../validacion.js';
import { buscarVigente, datosInvalidos, orden, paramId } from './comun.js';
import { gruposPorProducto, vistaGrupo, vistaOpcion } from './consultas.js';
import { precio, vistaProducto } from './productos.rutas.js';

const cuerpoGrupo = z.object({
  nombre: v.nombre,
  min: z.number().int().min(0).max(20),
  max: z.number().int().min(1).max(20),
  orden: orden.optional(),
});
const cuerpoOpcion = z.object({
  nombre: v.nombre,
  recargo: precio.optional(),
  orden: orden.optional(),
});

const validarMinMax = (min: number, max: number) => {
  if (min > max) throw datosInvalidos('El mínimo no puede ser mayor que el máximo');
};

export async function rutasOpciones(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const editar = { preHandler: [app.autenticar, app.requierePermiso('carta.editar')] };
  const disponibilidad = {
    preHandler: [app.autenticar, app.requierePermiso('carta.disponibilidad')],
  };

  app.get('/carta/productos/:id', editar, async (req) => {
    const { id } = paramId.parse(req.params);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const p = await buscarVigente(tx, productos, id, 'ese producto');
      const grupos = await gruposPorProducto(tx, [id]);
      return { ...vistaProducto(p), grupos: grupos.get(id) ?? [] };
    });
  });

  app.post('/carta/productos/:id/grupos', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpoGrupo.parse(req.body);
    validarMinMax(b.min, b.max);
    const g = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, productos, id, 'ese producto');
      const hermanos = await tx
        .select({ id: gruposOpciones.id })
        .from(gruposOpciones)
        .where(and(eq(gruposOpciones.productoId, id), isNull(gruposOpciones.eliminadoEn)));
      const [fila] = await tx
        .insert(gruposOpciones)
        .values({
          id: nuevoId(),
          localId: req.sesion.localId,
          productoId: id,
          orden: hermanos.length,
          ...b,
        })
        .returning();
      return fila!;
    });
    return reply.status(201).send(vistaGrupo(g));
  });

  app.patch('/carta/grupos/:id', editar, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpoGrupo.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const actual = await buscarVigente(tx, gruposOpciones, id, 'ese grupo');
      validarMinMax(b.min ?? actual.min, b.max ?? actual.max);
      if (!Object.keys(b).length) return vistaGrupo(actual);
      const [g] = await tx
        .update(gruposOpciones)
        .set(b)
        .where(eq(gruposOpciones.id, id))
        .returning();
      return vistaGrupo(g!);
    });
  });

  app.delete('/carta/grupos/:id', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, gruposOpciones, id, 'ese grupo');
      const ahora = new Date();
      await tx.update(gruposOpciones).set({ eliminadoEn: ahora }).where(eq(gruposOpciones.id, id));
      await tx
        .update(opciones)
        .set({ eliminadoEn: ahora })
        .where(and(eq(opciones.grupoId, id), isNull(opciones.eliminadoEn)));
    });
    return reply.status(204).send();
  });

  app.post('/carta/grupos/:id/opciones', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpoOpcion.parse(req.body);
    const o = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, gruposOpciones, id, 'ese grupo');
      const hermanas = await tx
        .select({ id: opciones.id })
        .from(opciones)
        .where(and(eq(opciones.grupoId, id), isNull(opciones.eliminadoEn)));
      const [fila] = await tx
        .insert(opciones)
        .values({
          id: nuevoId(),
          localId: req.sesion.localId,
          grupoId: id,
          orden: hermanas.length,
          ...b,
        })
        .returning();
      return fila!;
    });
    return reply.status(201).send(vistaOpcion(o));
  });

  app.patch('/carta/opciones/:id', editar, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpoOpcion.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const actual = await buscarVigente(tx, opciones, id, 'esa opción');
      if (!Object.keys(b).length) return vistaOpcion(actual);
      const [o] = await tx.update(opciones).set(b).where(eq(opciones.id, id)).returning();
      return vistaOpcion(o!);
    });
  });

  app.patch('/carta/opciones/:id/disponibilidad', disponibilidad, async (req) => {
    const { id } = paramId.parse(req.params);
    const { disponible } = z.object({ disponible: z.boolean() }).parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, opciones, id, 'esa opción');
      const [o] = await tx
        .update(opciones)
        .set({ disponible })
        .where(eq(opciones.id, id))
        .returning();
      return vistaOpcion(o!);
    });
  });

  app.delete('/carta/opciones/:id', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, opciones, id, 'esa opción');
      await tx.update(opciones).set({ eliminadoEn: new Date() }).where(eq(opciones.id, id));
    });
    return reply.status(204).send();
  });
}
