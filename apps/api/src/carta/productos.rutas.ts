import type { FastifyInstance } from 'fastify';
import { avisarCambiosDeCarta } from '../tiempoReal/avisar.js';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { categorias, productos, sectores } from '../db/schema/index.js';
import { registrarAuditoria } from '../auditoria/registrar.js';
import * as v from '../validacion.js';
import { buscarVigente, datosInvalidos, orden, paramId, reordenar, urlsFoto } from './comun.js';

type Fila = typeof productos.$inferSelect;
export const vistaProducto = (p: Fila) => ({
  id: p.id,
  categoriaId: p.categoriaId,
  sectorId: p.sectorId,
  nombre: p.nombre,
  descripcion: p.descripcion,
  precio: p.precio,
  foto: urlsFoto(p.foto),
  disponible: p.disponible,
  visible: p.visible,
  orden: p.orden,
  etiquetas: p.etiquetas,
});

/** Centavos; tope $ 9.999.999 para que precio + recargos × cantidad entren en int4 (fase 4). */
export const PRECIO_MAXIMO = 999_999_900;
export const precio = z.number().int('El precio va en centavos enteros').min(0).max(PRECIO_MAXIMO);

const cuerpo = z.object({
  categoriaId: z.uuid(),
  sectorId: z.uuid().nullable().optional(),
  nombre: v.nombre,
  descripcion: z.string().trim().max(400).nullable().optional(),
  precio,
  visible: z.boolean().optional(),
  orden: orden.optional(),
  etiquetas: z.array(z.string().trim().min(1).max(20)).max(6).optional(),
});

async function validarReferencias(tx: Tx, b: { categoriaId?: string; sectorId?: string | null }) {
  if (b.categoriaId) {
    const [c] = await tx
      .select({ id: categorias.id })
      .from(categorias)
      .where(and(eq(categorias.id, b.categoriaId), isNull(categorias.eliminadoEn)));
    if (!c) throw datosInvalidos('La categoría no existe');
  }
  if (b.sectorId) {
    const [s] = await tx
      .select({ id: sectores.id })
      .from(sectores)
      .where(and(eq(sectores.id, b.sectorId), isNull(sectores.eliminadoEn)));
    if (!s) throw datosInvalidos('El sector no existe');
  }
}

export async function rutasProductos(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  avisarCambiosDeCarta(app);
  const editar = { preHandler: [app.autenticar, app.requierePermiso('carta.editar')] };
  const disponibilidad = {
    preHandler: [app.autenticar, app.requierePermiso('carta.disponibilidad')],
  };

  app.get('/carta/productos', editar, async (req) => {
    const q = z.object({ categoriaId: z.uuid().optional() }).parse(req.query);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) =>
      (
        await tx
          .select()
          .from(productos)
          .where(
            and(
              isNull(productos.eliminadoEn),
              q.categoriaId ? eq(productos.categoriaId, q.categoriaId) : undefined,
            ),
          )
          .orderBy(asc(productos.orden), asc(productos.nombre))
      ).map(vistaProducto),
    );
  });

  app.post('/carta/productos', editar, async (req, reply) => {
    const b = cuerpo.parse(req.body);
    const p = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await validarReferencias(tx, b);
      const hermanos = await tx
        .select({ id: productos.id })
        .from(productos)
        .where(and(eq(productos.categoriaId, b.categoriaId), isNull(productos.eliminadoEn)));
      const [fila] = await tx
        .insert(productos)
        .values({ id: nuevoId(), localId: req.sesion.localId, orden: hermanos.length, ...b })
        .returning();
      return fila!;
    });
    return reply.status(201).send(vistaProducto(p));
  });

  app.put('/carta/productos/orden', editar, async (req, reply) => {
    const { ids } = z
      .object({ categoriaId: z.uuid(), ids: z.array(z.uuid()).min(1).max(500) })
      .parse(req.body);
    await conLocal(dbs.dbApp, req.sesion.localId, (tx) => reordenar(tx, productos, ids));
    return reply.status(204).send();
  });

  app.patch('/carta/productos/:id', editar, async (req) => {
    const { id } = paramId.parse(req.params);
    const b = cuerpo.partial().parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const antes = await buscarVigente(tx, productos, id, 'ese producto');
      if (!Object.keys(b).length) return vistaProducto(antes);
      await validarReferencias(tx, b);
      const [despues] = await tx.update(productos).set(b).where(eq(productos.id, id)).returning();
      if (b.precio !== undefined && b.precio !== antes.precio) {
        await registrarAuditoria(tx, {
          sesion: req.sesion,
          accion: 'producto.precio',
          entidad: 'producto',
          entidadId: id,
          antes: { precio: antes.precio },
          despues: { precio: b.precio },
        });
      }
      return vistaProducto(despues!);
    });
  });

  app.patch('/carta/productos/:id/disponibilidad', disponibilidad, async (req) => {
    const { id } = paramId.parse(req.params);
    const { disponible } = z.object({ disponible: z.boolean() }).parse(req.body);
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const antes = await buscarVigente(tx, productos, id, 'ese producto');
      const [despues] = await tx
        .update(productos)
        .set({ disponible })
        .where(eq(productos.id, id))
        .returning();
      if (antes.disponible !== disponible) {
        await registrarAuditoria(tx, {
          sesion: req.sesion,
          accion: 'producto.disponibilidad',
          entidad: 'producto',
          entidadId: id,
          antes: { disponible: antes.disponible },
          despues: { disponible },
        });
      }
      return vistaProducto(despues!);
    });
  });

  app.delete('/carta/productos/:id', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      await buscarVigente(tx, productos, id, 'ese producto');
      await tx.update(productos).set({ eliminadoEn: new Date() }).where(eq(productos.id, id));
    });
    return reply.status(204).send();
  });
}
