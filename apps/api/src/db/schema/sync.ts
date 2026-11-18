import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { locales } from './locales.js';

/** Registro de operaciones de outbox ya procesadas: garantiza que cada una se aplique una vez. */
export const operacionesAplicadas = pgTable('operaciones_aplicadas', {
  id: uuid('id').primaryKey(),
  localId: uuid('local_id')
    .notNull()
    .references(() => locales.id),
  dispositivoId: uuid('dispositivo_id').notNull(),
  tipo: text('tipo').notNull(),
  resultado: jsonb('resultado').notNull(),
  aplicadaEn: timestamp('aplicada_en', { withTimezone: true }).notNull().defaultNow(),
});
