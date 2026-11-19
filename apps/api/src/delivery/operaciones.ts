import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ITEMS_MAXIMOS, LIMITES_DELIVERY, MONTO_MAXIMO_CAJA, NOTA_MAXIMA, avanzaReparto, sinControl } from '@gula/shared';
import { deliveries, pedidos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { noEncontrado } from '../carta/comun.js';
import { registrarTipoOperacion } from '../sync/operaciones.js';
import { dia, insertarPedido, itemCreado, numero } from '../salon/operaciones.js';

const estadoInvalido = (m: string) => new ErrorApi(409, 'ESTADO_INVALIDO', m);
const texto = (max: number, min = 0) => z.string().max(max).transform(sinControl).pipe(z.string().min(min));
const montoOCero = z.number().int().min(0).max(MONTO_MAXIMO_CAJA);

registrarTipoOperacion('delivery.crear', {
  permiso: 'delivery.gestionar',
  tema: 'salon',
  esquema: z.object({
    pedidoId: z.uuid(),
    numero,
    dia,
    notas: z.string().max(NOTA_MAXIMA).transform(sinControl).nullish(),
    items: z.array(itemCreado).min(1).max(ITEMS_MAXIMOS),
    cliente: z.object({
      nombre: texto(LIMITES_DELIVERY.nombre, 1),
      telefono: texto(LIMITES_DELIVERY.telefono).default(''),
      direccion: texto(LIMITES_DELIVERY.direccion, 1),
      referencias: texto(LIMITES_DELIVERY.referencias).default(''),
    }),
    costoEnvio: montoOCero,
    pagaCon: montoOCero.nullish(),
  }),
  aplicar: async (tx, { sesion, hechaEn }, d) => {
    await insertarPedido(tx, sesion, hechaEn, { ...d, origen: 'delivery', sesionId: null, mesaId: null });
    await tx.insert(deliveries).values({
      id: d.pedidoId,
      localId: sesion.localId,
      pedidoId: d.pedidoId,
      clienteNombre: d.cliente.nombre,
      telefono: d.cliente.telefono,
      direccion: d.cliente.direccion,
      referencias: d.cliente.referencias,
      costoEnvio: d.costoEnvio,
      pagaCon: d.pagaCon ?? null,
      estado: 'preparando',
      creadoEn: hechaEn,
    });
  },
});

registrarTipoOperacion('delivery.estado', {
  permiso: 'delivery.gestionar',
  tema: 'salon',
  esquema: z.object({
    pedidoId: z.uuid(),
    estado: z.enum(['en_camino', 'entregado']),
    repartidor: texto(LIMITES_DELIVERY.repartidor).nullish(),
  }),
  aplicar: async (tx, { hechaEn }, d) => {
    const [f] = await tx.select().from(deliveries).where(eq(deliveries.id, d.pedidoId)).for('update');
    if (!f) throw noEncontrado('ese delivery');
    const [p] = await tx.select({ estado: pedidos.estado }).from(pedidos).where(eq(pedidos.id, d.pedidoId));
    if (p!.estado === 'anulado') throw estadoInvalido('Ese delivery está anulado.');
    if (!avanzaReparto(f.estado, d.estado)) throw estadoInvalido('Ese delivery ya pasó por ese estado.');
    if (d.estado === 'entregado' && p!.estado !== 'cobrado')
      throw new ErrorApi(409, 'CUENTA_PENDIENTE', 'Cobrá el delivery antes de marcarlo entregado.');
    await tx
      .update(deliveries)
      .set({
        estado: d.estado,
        ...(d.estado === 'en_camino' ? { enCaminoEn: hechaEn } : { entregadoEn: hechaEn }),
        ...(d.repartidor ? { repartidor: d.repartidor } : {}),
      })
      .where(eq(deliveries.id, d.pedidoId));
  },
});
