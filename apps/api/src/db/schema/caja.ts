import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { pedidos, sesionesMesa, sincronizable } from './salon.js';

export const turnosCaja = pgTable(
  'turnos_caja',
  {
    ...sincronizable(),
    abiertoPor: uuid('abierto_por').notNull(),
    abiertoEn: timestamp('abierto_en', { withTimezone: true }).notNull().defaultNow(),
    fondo: integer('fondo').notNull(),
    cerradoPor: uuid('cerrado_por'),
    cerradoEn: timestamp('cerrado_en', { withTimezone: true }),
    contado: integer('contado'),
    esperado: integer('esperado'),
    diferencia: integer('diferencia'),
    notas: text('notas'),
  },
  (t) => [
    uniqueIndex('turnos_una_abierta').on(t.localId).where(sql`cerrado_en is null`),
    check('turnos_fondo', sql`${t.fondo} >= 0`),
  ],
);

export const cobros = pgTable(
  'cobros',
  {
    ...sincronizable(),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnosCaja.id),
    sesionId: uuid('sesion_id').references(() => sesionesMesa.id),
    pedidoId: uuid('pedido_id').references(() => pedidos.id),
    subtotal: integer('subtotal').notNull(),
    descuento: integer('descuento').notNull().default(0),
    motivoDescuento: text('motivo_descuento'),
    total: integer('total').notNull(),
    cobradoPor: uuid('cobrado_por').notNull(),
    cobradoEn: timestamp('cobrado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cobros_turno_idx').on(t.turnoId),
    check('cobros_destino', sql`(${t.sesionId} is null) <> (${t.pedidoId} is null)`),
    check('cobros_montos', sql`${t.descuento} >= 0 and ${t.descuento} <= ${t.subtotal} and ${t.total} = ${t.subtotal} - ${t.descuento}`),
  ],
);

export const pagos = pgTable(
  'pagos',
  {
    ...sincronizable(),
    cobroId: uuid('cobro_id')
      .notNull()
      .references(() => cobros.id),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnosCaja.id),
    metodo: text('metodo', { enum: ['efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro'] }).notNull(),
    monto: integer('monto').notNull(),
    propina: integer('propina').notNull().default(0),
  },
  (t) => [
    index('pagos_turno_idx').on(t.turnoId),
    check('pagos_metodo', sql`${t.metodo} in ('efectivo', 'debito', 'credito', 'transferencia', 'mercadopago', 'otro')`),
    check('pagos_montos', sql`${t.monto} > 0 and ${t.propina} >= 0`),
  ],
);

export const movimientosCaja = pgTable(
  'movimientos_caja',
  {
    ...sincronizable(),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnosCaja.id),
    tipo: text('tipo', { enum: ['ingreso', 'egreso'] }).notNull(),
    categoria: text('categoria', { enum: ['proveedores', 'sueldos', 'retiro', 'otro'] }).notNull(),
    monto: integer('monto').notNull(),
    motivo: text('motivo').notNull(),
    usuarioId: uuid('usuario_id').notNull(),
    hechoEn: timestamp('hecho_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('movimientos_turno_idx').on(t.turnoId),
    check('movimientos_tipo', sql`${t.tipo} in ('ingreso', 'egreso')`),
    check('movimientos_categoria', sql`${t.categoria} in ('proveedores', 'sueldos', 'retiro', 'otro')`),
    check('movimientos_monto', sql`${t.monto} > 0`),
  ],
);
