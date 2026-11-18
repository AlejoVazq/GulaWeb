import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './comun.js';
import { dispositivos } from './dispositivos.js';
import { locales } from './locales.js';
import { usuarios } from './usuarios.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    localId: uuid('local_id').notNull().references(() => locales.id),
    dispositivoId: uuid('dispositivo_id').notNull().references(() => dispositivos.id),
    usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
    familia: uuid('familia').notNull(),
    hash: text('hash').notNull().unique(),
    usadoEn: timestamp('usado_en', { withTimezone: true }),
    revocado: boolean('revocado').notNull().default(false),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  },
  (t) => [index('refresh_tokens_familia_idx').on(t.familia)],
);
