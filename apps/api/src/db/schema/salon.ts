import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { creadoEn, id } from './comun.js';
import { locales } from './locales.js';
import { sectores } from './carta.js';

export const sincronizable = () => ({
  id: id(),
  localId: uuid('local_id')
    .notNull()
    .references(() => locales.id),
  creadoEn: creadoEn(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  eliminadoEn: timestamp('eliminado_en', { withTimezone: true }),
});

export const mesas = pgTable(
  'mesas',
  {
    ...sincronizable(),
    nombre: text('nombre').notNull(),
    zona: text('zona'),
    capacidad: integer('capacidad'),
    orden: integer('orden').notNull().default(0),
    token: text('token').notNull().unique(),
  },
  (t) => [index('mesas_local_idx').on(t.localId)],
);

export const sesionesMesa = pgTable(
  'sesiones_mesa',
  {
    ...sincronizable(),
    mesaId: uuid('mesa_id')
      .notNull()
      .references(() => mesas.id),
    estado: text('estado', { enum: ['abierta', 'cuenta_pedida', 'cerrada'] }).notNull(),
    comensales: integer('comensales'),
    abiertaPor: uuid('abierta_por'),
    abiertaEn: timestamp('abierta_en', { withTimezone: true }).notNull().defaultNow(),
    cerradaPor: uuid('cerrada_por'),
    cerradaEn: timestamp('cerrada_en', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sesiones_mesa_una_abierta').on(t.mesaId).where(sql`estado <> 'cerrada'`),
    index('sesiones_local_idx').on(t.localId),
    check('sesiones_estado', sql`${t.estado} in ('abierta', 'cuenta_pedida', 'cerrada')`),
  ],
);

export const pedidos = pgTable(
  'pedidos',
  {
    ...sincronizable(),
    origen: text('origen', { enum: ['qr', 'manual', 'mostrador'] }).notNull(),
    estado: text('estado', { enum: ['pendiente', 'confirmado', 'rechazado', 'anulado', 'cobrado'] }).notNull(),
    sesionId: uuid('sesion_id').references(() => sesionesMesa.id),
    mesaId: uuid('mesa_id').references(() => mesas.id),
    numero: integer('numero'),
    dia: text('dia'),
    notas: text('notas'),
    motivoRechazo: text('motivo_rechazo'),
    creadoPor: uuid('creado_por'),
    confirmadoPor: uuid('confirmado_por'),
    confirmadoEn: timestamp('confirmado_en', { withTimezone: true }),
    rechazadoEn: timestamp('rechazado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por'),
    motivoAnulacion: text('motivo_anulacion'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
  },
  (t) => [
    index('pedidos_local_idx').on(t.localId),
    index('pedidos_sesion_idx').on(t.sesionId),
    check('pedidos_origen', sql`${t.origen} in ('qr', 'manual', 'mostrador')`),
    check('pedidos_estado', sql`${t.estado} in ('pendiente', 'confirmado', 'rechazado', 'anulado', 'cobrado')`),
  ],
);

export const itemsPedido = pgTable(
  'items_pedido',
  {
    ...sincronizable(),
    pedidoId: uuid('pedido_id')
      .notNull()
      .references(() => pedidos.id),
    productoId: uuid('producto_id').notNull(),
    nombre: text('nombre').notNull(),
    precioUnitario: integer('precio_unitario').notNull(),
    cantidad: integer('cantidad').notNull(),
    seleccion: jsonb('seleccion').$type<Record<string, string[]>>().notNull().default({}),
    resumenOpciones: text('resumen_opciones').notNull().default(''),
    nota: text('nota').notNull().default(''),
    sectorId: uuid('sector_id').references(() => sectores.id),
    anulado: boolean('anulado').notNull().default(false),
    anuladoPor: uuid('anulado_por'),
    motivoAnulacion: text('motivo_anulacion'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
  },
  (t) => [
    index('items_pedido_idx').on(t.pedidoId),
    check('items_cantidad', sql`${t.cantidad} between 1 and 50`),
    check('items_precio', sql`${t.precioUnitario} >= 0`),
  ],
);

export const avisosMesa = pgTable(
  'avisos_mesa',
  {
    ...sincronizable(),
    sesionId: uuid('sesion_id')
      .notNull()
      .references(() => sesionesMesa.id),
    tipo: text('tipo', { enum: ['llamar', 'cuenta'] }).notNull(),
    atendidoPor: uuid('atendido_por'),
    atendidoEn: timestamp('atendido_en', { withTimezone: true }),
  },
  (t) => [
    index('avisos_sesion_idx').on(t.sesionId),
    check('avisos_tipo', sql`${t.tipo} in ('llamar', 'cuenta')`),
  ],
);
