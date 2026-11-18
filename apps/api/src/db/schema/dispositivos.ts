import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creadoEn, id } from './comun.js';
import { locales } from './locales.js';

export const dispositivos = pgTable('dispositivos', {
  id: id(),
  localId: uuid('local_id').notNull().references(() => locales.id),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creadoEn(),
  ultimoUso: timestamp('ultimo_uso', { withTimezone: true }),
});
