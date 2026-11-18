import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creadoEn, id } from './comun.js';
import { locales } from './locales.js';

// Columnas comunes de las tablas sincronizables (fase 3).
const sincronizable = () => ({
  id: id(),
  localId: uuid('local_id').notNull().references(() => locales.id),
  creadoEn: creadoEn(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
});

export const sectores = pgTable('sectores', {
  ...sincronizable(),
  nombre: text('nombre').notNull(),
  orden: integer('orden').notNull().default(0),
});

export const categorias = pgTable(
  'categorias',
  {
    ...sincronizable(),
    nombre: text('nombre').notNull(),
    orden: integer('orden').notNull().default(0),
    visible: boolean('visible').notNull().default(true),
    horarioDesde: time('horario_desde'),
    horarioHasta: time('horario_hasta'),
  },
  (t) => [index('categorias_local_idx').on(t.localId)],
);

export const productos = pgTable(
  'productos',
  {
    ...sincronizable(),
    categoriaId: uuid('categoria_id').notNull().references(() => categorias.id),
    sectorId: uuid('sector_id').references(() => sectores.id),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    precio: integer('precio').notNull(),
    foto: text('foto'),
    disponible: boolean('disponible').notNull().default(true),
    visible: boolean('visible').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    etiquetas: text('etiquetas').array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    check('productos_precio_positivo', sql`${t.precio} >= 0`),
    index('productos_categoria_idx').on(t.categoriaId),
  ],
);

export const gruposOpciones = pgTable(
  'grupos_opciones',
  {
    ...sincronizable(),
    productoId: uuid('producto_id').notNull().references(() => productos.id),
    nombre: text('nombre').notNull(),
    min: integer('min').notNull().default(0),
    max: integer('max').notNull().default(1),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [
    check('grupos_min_max', sql`${t.min} >= 0 and ${t.max} >= 1 and ${t.min} <= ${t.max}`),
    index('grupos_producto_idx').on(t.productoId),
  ],
);

export const opciones = pgTable(
  'opciones',
  {
    ...sincronizable(),
    grupoId: uuid('grupo_id').notNull().references(() => gruposOpciones.id),
    nombre: text('nombre').notNull(),
    recargo: integer('recargo').notNull().default(0),
    disponible: boolean('disponible').notNull().default(true),
    orden: integer('orden').notNull().default(0),
  },
  (t) => [
    check('opciones_recargo_positivo', sql`${t.recargo} >= 0`),
    index('opciones_grupo_idx').on(t.grupoId),
  ],
);
