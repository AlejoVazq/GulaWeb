import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { creadoEn, id } from './comun.js';
import { locales } from './locales.js';

export const auditoria = pgTable(
  'auditoria',
  {
    id: id(),
    localId: uuid('local_id')
      .notNull()
      .references(() => locales.id),
    usuarioId: uuid('usuario_id').notNull(),
    autorizadoPor: uuid('autorizado_por'),
    accion: text('accion').notNull(),
    entidad: text('entidad').notNull(),
    entidadId: uuid('entidad_id'),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
    creadoEn: creadoEn(),
  },
  (t) => [index('auditoria_local_fecha_idx').on(t.localId, t.creadoEn)],
);
