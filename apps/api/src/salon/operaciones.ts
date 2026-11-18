import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { CANTIDAD_MAXIMA, ITEMS_MAXIMOS, NOTA_MAXIMA } from '@gula/shared';
import { PRECIO_MAXIMO } from '../carta/productos.rutas.js';
import type { Tx } from '../db/cliente.js';
import {
  avisosMesa,
  itemsPedido,
  mesas,
  pedidos,
  sectores,
  sesionesMesa,
} from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { buscarVigente, datosInvalidos, noEncontrado } from '../carta/comun.js';
import { registrarTipoOperacion } from '../sync/operaciones.js';

const estadoInvalido = (mensaje: string) => new ErrorApi(409, 'ESTADO_INVALIDO', mensaje);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const numero = z.number().int().min(1).max(100_000);
const seleccion = z.record(z.uuid(), z.array(z.uuid()).max(30));

async function sesionNoCerrada(tx: Tx, sesionId: string) {
  const [s] = await tx
    .select()
    .from(sesionesMesa)
    .where(eq(sesionesMesa.id, sesionId))
    .for('update');
  if (!s) throw noEncontrado('esa mesa abierta');
  if (s.estado === 'cerrada') throw estadoInvalido('La mesa ya está cerrada.');
  return s;
}

async function pedidoPendiente(tx: Tx, pedidoId: string) {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId)).for('update');
  if (!p) throw noEncontrado('ese pedido');
  if (p.estado !== 'pendiente') throw estadoInvalido('Ese pedido ya fue confirmado o rechazado.');
  return p;
}

registrarTipoOperacion('mesa.abrir', {
  permiso: 'mesa.operar',
  tema: 'salon',
  esquema: z.object({
    sesionId: z.uuid(),
    mesaId: z.uuid(),
    comensales: z.number().int().min(1).max(100).nullish(),
  }),
  aplicar: async (tx, { sesion }, d) => {
    // El bloqueo de la mesa serializa aperturas simultáneas.
    await buscarVigente(tx, mesas, d.mesaId, 'esa mesa');
    const [ocupada] = await tx
      .select({ id: sesionesMesa.id })
      .from(sesionesMesa)
      .where(and(eq(sesionesMesa.mesaId, d.mesaId), ne(sesionesMesa.estado, 'cerrada')));
    if (ocupada) throw new ErrorApi(409, 'MESA_OCUPADA', 'La mesa ya está abierta.');
    await tx.insert(sesionesMesa).values({
      id: d.sesionId,
      localId: sesion.localId,
      mesaId: d.mesaId,
      estado: 'abierta',
      comensales: d.comensales ?? null,
      abiertaPor: sesion.usuarioId,
    });
  },
});

registrarTipoOperacion('mesa.cerrar', {
  permiso: 'mesa.operar',
  tema: 'salon',
  esquema: z.object({ sesionId: z.uuid() }),
  aplicar: async (tx, { sesion }, d) => {
    await sesionNoCerrada(tx, d.sesionId);
    const ahora = new Date();
    // Lo que quedó sin resolver se cierra con la mesa: el cliente ve el rechazo y la PC deja de sonar.
    await tx
      .update(pedidos)
      .set({ estado: 'rechazado', motivoRechazo: 'La mesa se cerró', rechazadoEn: ahora })
      .where(and(eq(pedidos.sesionId, d.sesionId), eq(pedidos.estado, 'pendiente')));
    await tx
      .update(avisosMesa)
      .set({ atendidoEn: ahora, atendidoPor: sesion.usuarioId })
      .where(and(eq(avisosMesa.sesionId, d.sesionId), isNull(avisosMesa.atendidoEn)));
    await tx
      .update(sesionesMesa)
      .set({ estado: 'cerrada', cerradaEn: ahora, cerradaPor: sesion.usuarioId })
      .where(eq(sesionesMesa.id, d.sesionId));
  },
});

const itemCreado = z.object({
  itemId: z.uuid(),
  productoId: z.uuid(),
  nombre: z.string().trim().min(1).max(120),
  precioUnitario: z.number().int().min(0).max(PRECIO_MAXIMO),
  cantidad: z.number().int().min(1).max(CANTIDAD_MAXIMA),
  seleccion: seleccion.default({}),
  resumenOpciones: z.string().max(500).default(''),
  nota: z.string().max(NOTA_MAXIMA).default(''),
  sectorId: z.uuid().nullable().default(null),
});

registrarTipoOperacion('pedido.crear', {
  permiso: 'pedido.tomar',
  tema: 'salon',
  esquema: z
    .object({
      pedidoId: z.uuid(),
      origen: z.enum(['manual', 'mostrador']),
      sesionId: z.uuid().nullish(),
      numero,
      dia,
      notas: z.string().trim().max(NOTA_MAXIMA).nullish(),
      items: z.array(itemCreado).min(1).max(ITEMS_MAXIMOS),
    })
    .refine(
      (d) => (d.origen === 'manual') === !!d.sesionId,
      'Un pedido manual va en una mesa; uno de mostrador, no.',
    ),
  aplicar: async (tx, { sesion }, d) => {
    const s = d.sesionId ? await sesionNoCerrada(tx, d.sesionId) : null;
    // Un sector borrado del todo no rompe el pedido: el ítem queda sin sector.
    const idsSector = [...new Set(d.items.map((i) => i.sectorId).filter((x): x is string => !!x))];
    const validos = new Set(
      idsSector.length
        ? (
            await tx
              .select({ id: sectores.id })
              .from(sectores)
              .where(inArray(sectores.id, idsSector))
          ).map((x) => x.id)
        : [],
    );
    const ahora = new Date();
    await tx.insert(pedidos).values({
      id: d.pedidoId,
      localId: sesion.localId,
      origen: d.origen,
      estado: 'confirmado',
      sesionId: s?.id ?? null,
      mesaId: s?.mesaId ?? null,
      numero: d.numero,
      dia: d.dia,
      notas: d.notas ?? null,
      creadoPor: sesion.usuarioId,
      confirmadoPor: sesion.usuarioId,
      confirmadoEn: ahora,
    });
    await tx.insert(itemsPedido).values(
      d.items.map(({ itemId, sectorId, ...i }) => ({
        ...i,
        id: itemId,
        localId: sesion.localId,
        pedidoId: d.pedidoId,
        sectorId: sectorId && validos.has(sectorId) ? sectorId : null,
      })),
    );
  },
});

registrarTipoOperacion('pedido.confirmar', {
  permiso: 'pedido.confirmar',
  tema: 'salon',
  esquema: z.object({
    pedidoId: z.uuid(),
    numero,
    dia,
    items: z
      .array(z.object({ itemId: z.uuid(), cantidad: z.number().int().min(0).max(CANTIDAD_MAXIMA) }))
      .max(ITEMS_MAXIMOS)
      .optional(),
  }),
  aplicar: async (tx, { sesion }, d) => {
    await pedidoPendiente(tx, d.pedidoId);
    const actuales = await tx
      .select()
      .from(itemsPedido)
      .where(and(eq(itemsPedido.pedidoId, d.pedidoId), eq(itemsPedido.anulado, false)));
    const ajustes = new Map((d.items ?? []).map((a) => [a.itemId, a.cantidad]));
    for (const id of ajustes.keys())
      if (!actuales.some((i) => i.id === id))
        throw datosInvalidos('El ajuste incluye ítems que no son de este pedido.');
    if (actuales.every((i) => ajustes.get(i.id) === 0))
      throw datosInvalidos('No podés confirmar un pedido sin ítems. Rechazalo.');
    for (const [id, cantidad] of ajustes) {
      await tx
        .update(itemsPedido)
        .set(cantidad === 0 ? { anulado: true } : { cantidad })
        .where(eq(itemsPedido.id, id));
    }
    await tx
      .update(pedidos)
      .set({
        estado: 'confirmado',
        numero: d.numero,
        dia: d.dia,
        confirmadoPor: sesion.usuarioId,
        confirmadoEn: new Date(),
      })
      .where(eq(pedidos.id, d.pedidoId));
  },
});

registrarTipoOperacion('pedido.rechazar', {
  permiso: 'pedido.confirmar',
  tema: 'salon',
  esquema: z.object({ pedidoId: z.uuid(), motivo: z.string().trim().min(1).max(NOTA_MAXIMA) }),
  aplicar: async (tx, { sesion }, d) => {
    await pedidoPendiente(tx, d.pedidoId);
    await tx
      .update(pedidos)
      .set({
        estado: 'rechazado',
        motivoRechazo: d.motivo,
        rechazadoEn: new Date(),
        confirmadoPor: sesion.usuarioId,
      })
      .where(eq(pedidos.id, d.pedidoId));
  },
});

registrarTipoOperacion('aviso.atender', {
  permiso: 'mesa.operar',
  tema: 'salon',
  esquema: z.object({ avisoId: z.uuid() }),
  aplicar: async (tx, { sesion }, d) => {
    const [a] = await tx
      .select()
      .from(avisosMesa)
      .where(eq(avisosMesa.id, d.avisoId))
      .for('update');
    if (!a) throw noEncontrado('ese aviso');
    if (a.atendidoEn) return; // Ya lo atendió otra persona: no es un error.
    await tx
      .update(avisosMesa)
      .set({ atendidoEn: new Date(), atendidoPor: sesion.usuarioId })
      .where(eq(avisosMesa.id, d.avisoId));
  },
});
