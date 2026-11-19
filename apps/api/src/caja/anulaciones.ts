import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/cliente.js';
import { itemsPedido, pedidos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { registrarAuditoria } from '../auditoria/registrar.js';
import { registrarTipoOperacion } from '../sync/operaciones.js';
import { noEncontrado } from '../carta/comun.js';
import { motivo } from './comun.js';

async function pedidoConfirmado(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (!p) throw noEncontrado('ese pedido');
  if (p.estado !== 'confirmado')
    throw new ErrorApi(409, 'ESTADO_INVALIDO', 'Solo se anula lo confirmado y todavía sin cobrar.');
  return p;
}

registrarTipoOperacion('item.anular', {
  permiso: 'pedido.anular',
  tema: 'salon',
  esquema: z.object({ itemId: z.uuid(), pedidoId: z.uuid(), motivo }),
  aplicar: async (tx, { sesion, hechaEn, autorizadoPor }, d) => {
    await pedidoConfirmado(tx, d.pedidoId);
    const [i] = await tx
      .select()
      .from(itemsPedido)
      .where(and(eq(itemsPedido.id, d.itemId), eq(itemsPedido.pedidoId, d.pedidoId)));
    if (!i) throw noEncontrado('ese ítem');
    if (i.anulado) return;
    const anulacion = { anuladoPor: sesion.usuarioId, motivoAnulacion: d.motivo, anuladoEn: hechaEn };
    await tx.update(itemsPedido).set({ anulado: true, ...anulacion }).where(eq(itemsPedido.id, i.id));
    const [vivo] = await tx
      .select({ id: itemsPedido.id })
      .from(itemsPedido)
      .where(and(eq(itemsPedido.pedidoId, d.pedidoId), eq(itemsPedido.anulado, false)));
    if (!vivo) await tx.update(pedidos).set({ estado: 'anulado', ...anulacion }).where(eq(pedidos.id, d.pedidoId));
    await registrarAuditoria(tx, {
      sesion,
      autorizadoPor,
      accion: 'item.anular',
      entidad: 'item_pedido',
      entidadId: i.id,
      antes: { nombre: i.nombre, cantidad: i.cantidad, precioUnitario: i.precioUnitario },
      despues: { motivo: d.motivo },
    });
  },
});

registrarTipoOperacion('pedido.anular', {
  permiso: 'pedido.anular',
  tema: 'salon',
  esquema: z.object({ pedidoId: z.uuid(), motivo }),
  aplicar: async (tx, { sesion, hechaEn, autorizadoPor }, d) => {
    const p = await pedidoConfirmado(tx, d.pedidoId);
    await tx
      .update(pedidos)
      .set({ estado: 'anulado', anuladoPor: sesion.usuarioId, motivoAnulacion: d.motivo, anuladoEn: hechaEn })
      .where(eq(pedidos.id, p.id));
    await registrarAuditoria(tx, {
      sesion,
      autorizadoPor,
      accion: 'pedido.anular',
      entidad: 'pedido',
      entidadId: p.id,
      antes: { numero: p.numero, estado: p.estado },
      despues: { motivo: d.motivo },
    });
  },
});
