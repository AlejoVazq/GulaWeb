import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Rol } from '@gula/shared';
import { creadoEn, id } from './comun.js';
import { locales } from './locales.js';

export const usuarios = pgTable(
  'usuarios',
  {
    id: id(),
    localId: uuid('local_id')
      .notNull()
      .references(() => locales.id),
    nombre: text('nombre').notNull(),
    rol: text('rol').$type<Rol>().notNull(),
    email: text('email').unique(),
    passwordHash: text('password_hash'),
    pinHash: text('pin_hash').notNull(),
    pinFallos: integer('pin_fallos').notNull().default(0),
    pinBloqueadoHasta: timestamp('pin_bloqueado_hasta', { withTimezone: true }),
    activo: boolean('activo').notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [check('usuarios_rol_valido', sql`${t.rol} in ('dueno','encargado','mesero')`)],
);
