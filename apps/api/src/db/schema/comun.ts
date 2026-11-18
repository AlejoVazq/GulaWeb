import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const id = () => uuid('id').primaryKey();
export const creadoEn = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();
