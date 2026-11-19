import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { METODOS_PAGO, PAGOS_MAXIMOS } from '@gula/shared';
import { cobros, pagos, pedidos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { registrarAuditoria } from '../auditoria/registrar.js';
import { registrarTipoOperacion } from '../sync/operaciones.js';
import { cerrarSesion, sesionNoCerrada } from '../salon/operaciones.js';
import { noEncontrado } from '../carta/comun.js';
import { monto, montoOCero, motivo, turnoAbierto } from './comun.js';

const estadoInvalido = (m: string) => new ErrorApi(409, 'ESTADO_INVALIDO', m);

const esquema = z
  .object({
    cobroId: z.uuid(),
    turnoId: z.uuid(),
    sesionId: z.uuid().nullish(),
    pedidoId: z.uuid().nullish(),
    /** Los pedidos que cobra la PC (los que ella ve confirmados): solo esos pasan a `cobrado`. */
    pedidoIds: z.array(z.uuid()).max(200).nullish(),
    subtotal: montoOCero,
    descuento: z.object({ monto, motivo }).nullish(),
    pagos: z
      .array(z.object({ pagoId: z.uuid(), metodo: z.enum(METODOS_PAGO), monto, propina: montoOCero }))
      .max(PAGOS_MAXIMOS),
  })
  .refine((d) => !d.sesionId !== !d.pedidoId, 'Se cobra una mesa o un pedido de mostrador.')
  .refine((d) => !d.sesionId || (d.pedidoIds?.length ?? 0) > 0, 'Indicá los pedidos que se cobran.')
  .refine((d) => (d.descuento?.monto ?? 0) <= d.subtotal, 'El descuento no puede superar el total.')
  .refine(
    (d) => d.pagos.reduce((s, p) => s + p.monto, 0) === d.subtotal - (d.descuento?.monto ?? 0),
    'Los pagos no suman el total a cobrar.',
  );

/**
 * Cobro atómico: guarda el cobro y sus pagos, marca los pedidos `cobrado` y, si es una mesa, la cierra.
 * El subtotal lo calcula la PC (personal de confianza, igual que los precios de `pedido.crear`).
 */
registrarTipoOperacion('cuenta.cobrar', {
  permiso: 'cobro.registrar',
  tema: ['caja', 'salon'],
  esquema,
  aplicar: async (tx, { sesion, hechaEn, autorizadoPor }, d) => {
    await turnoAbierto(tx, d.turnoId);
    if (d.sesionId) {
      const s = await sesionNoCerrada(tx, d.sesionId).catch(() => {
        throw estadoInvalido('La mesa ya está cerrada (¿ya se cobró?).');
      });
      await tx
        .update(pedidos)
        .set({ estado: 'cobrado' })
        .where(and(eq(pedidos.sesionId, s.id), eq(pedidos.estado, 'confirmado'), inArray(pedidos.id, d.pedidoIds!)));
      // Si el servidor tiene otro pedido confirmado que la PC no cobró (por ejemplo, una anulación offline que
      // se rechazó), la mesa queda abierta para que se vea y se resuelva, y queda auditado.
      const sinCobrar = await tx
        .select({ id: pedidos.id })
        .from(pedidos)
        .where(and(eq(pedidos.sesionId, s.id), eq(pedidos.estado, 'confirmado')));
      if (sinCobrar.length)
        await registrarAuditoria(tx, {
          sesion,
          accion: 'cobro.discrepancia',
          entidad: 'cobro',
          entidadId: d.cobroId,
          despues: { sesionId: s.id, sinCobrar: sinCobrar.map((p) => p.id) },
        });
      else await cerrarSesion(tx, s.id, sesion.usuarioId, hechaEn);
    } else {
      const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, d.pedidoId!)).for('update');
      if (!p) throw noEncontrado('ese pedido');
      if (p.sesionId) throw estadoInvalido('Ese pedido es de una mesa: se cobra con la mesa.');
      if (p.estado !== 'confirmado') throw estadoInvalido('Ese pedido ya se cobró o se anuló.');
      await tx.update(pedidos).set({ estado: 'cobrado' }).where(eq(pedidos.id, p.id));
    }
    const descuento = d.descuento?.monto ?? 0;
    await tx.insert(cobros).values({
      id: d.cobroId,
      localId: sesion.localId,
      turnoId: d.turnoId,
      sesionId: d.sesionId ?? null,
      pedidoId: d.pedidoId ?? null,
      subtotal: d.subtotal,
      descuento,
      motivoDescuento: d.descuento?.motivo ?? null,
      total: d.subtotal - descuento,
      cobradoPor: sesion.usuarioId,
      cobradoEn: hechaEn,
    });
    if (d.pagos.length)
      await tx.insert(pagos).values(
        d.pagos.map((p) => ({
          id: p.pagoId,
          localId: sesion.localId,
          cobroId: d.cobroId,
          turnoId: d.turnoId,
          metodo: p.metodo,
          monto: p.monto,
          propina: p.propina,
        })),
      );
    if (descuento)
      await registrarAuditoria(tx, {
        sesion,
        autorizadoPor,
        accion: 'cobro.descuento',
        entidad: 'cobro',
        entidadId: d.cobroId,
        despues: { subtotal: d.subtotal, descuento, motivo: d.descuento!.motivo },
      });
  },
});
