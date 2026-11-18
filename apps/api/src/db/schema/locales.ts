import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { creadoEn, id } from './comun.js';

export const locales = pgTable('locales', {
  id: id(),
  nombre: text('nombre').notNull(),
  slug: text('slug').notNull().unique(),
  marca: jsonb('marca').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  creadoEn: creadoEn(),
});
