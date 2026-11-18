import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { CartaPublica } from '@gula/shared';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { categorias, locales, productos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { gruposPorProducto } from './consultas.js';
import { hhmm, urlsFoto } from './comun.js';
import { enHorario } from './horario.js';

export async function armarCartaPublica(
  dbs: Dbs,
  slug: string,
  ahora = new Date(),
): Promise<CartaPublica> {
  // Solo se resuelve el slug sin RLS; el resto se lee con el local fijado.
  const [local] = await dbs.dbAdmin
    .select({ id: locales.id, nombre: locales.nombre, slug: locales.slug, marca: locales.marca })
    .from(locales)
    .where(eq(locales.slug, slug));
  if (!local) throw new ErrorApi(404, 'LOCAL_NO_ENCONTRADO', 'No encontramos este local.');
  return conLocal(dbs.dbApp, local.id, (tx) => cartaDeLocal(tx, local, ahora));
}

type LocalCarta = { nombre: string; slug: string; marca: unknown };

/** Carta pública del local fijado en `tx` (categorías y productos visibles y vigentes). */
export async function cartaDeLocal(
  tx: Tx,
  local: LocalCarta,
  ahora = new Date(),
): Promise<CartaPublica> {
  const cats = await tx
    .select()
    .from(categorias)
    .where(and(eq(categorias.visible, true), isNull(categorias.eliminadoEn)))
    .orderBy(asc(categorias.orden), asc(categorias.nombre));
  const prods = cats.length
    ? await tx
        .select()
        .from(productos)
        .where(
          and(
            inArray(
              productos.categoriaId,
              cats.map((c) => c.id),
            ),
            eq(productos.visible, true),
            isNull(productos.eliminadoEn),
          ),
        )
        .orderBy(asc(productos.orden), asc(productos.nombre))
    : [];
  const grupos = await gruposPorProducto(
    tx,
    prods.map((p) => p.id),
  );

  return {
    local: {
      nombre: local.nombre,
      slug: local.slug,
      marca: local.marca as Record<string, unknown>,
    },
    categorias: cats
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        horario:
          c.horarioDesde && c.horarioHasta
            ? { desde: hhmm(c.horarioDesde)!, hasta: hhmm(c.horarioHasta)! }
            : null,
        enHorario: enHorario(hhmm(c.horarioDesde), hhmm(c.horarioHasta), ahora),
        productos: prods
          .filter((p) => p.categoriaId === c.id)
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            descripcion: p.descripcion,
            precio: p.precio,
            foto: urlsFoto(p.foto),
            disponible: p.disponible,
            etiquetas: p.etiquetas,
            grupos: (grupos.get(p.id) ?? []).map((g) => ({
              id: g.id,
              nombre: g.nombre,
              min: g.min,
              max: g.max,
              opciones: g.opciones.map((o) => ({
                id: o.id,
                nombre: o.nombre,
                recargo: o.recargo,
                disponible: o.disponible,
              })),
            })),
          })),
      }))
      .filter((c) => c.productos.length > 0),
  };
}

export async function rutasPublicas(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  app.get(
    '/publico/locales/:slug/carta',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { slug } = z.object({ slug: z.string().min(1).max(60) }).parse(req.params);
      const carta = await armarCartaPublica(dbs, slug);
      reply.header('cache-control', 'public, max-age=30');
      return carta;
    },
  );
}
