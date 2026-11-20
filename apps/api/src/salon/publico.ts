import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  CANTIDAD_MAXIMA,
  ITEMS_MAXIMOS,
  NOTA_MAXIMA,
  nuevoId,
  sinControl,
  type MesaPublica,
  type PedidoPublico,
} from '@gula/shared';
import type { Config } from '../config.js';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import {
  avisosMesa,
  itemsPedido,
  locales,
  mesas,
  pedidos,
  sesionesMesa,
} from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { crearLimite } from '../seguridad/limite.js';
import { armarItems } from './precios.js';

const paramToken = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{22}$/) });

const cuerpoPedido = z.object({
  id: z.uuid(),
  items: z
    .array(
      z.object({
        productoId: z.uuid(),
        seleccion: z.record(z.uuid(), z.array(z.uuid()).max(30)).default({}),
        nota: z.string().max(NOTA_MAXIMA).default('').transform(sinControl),
        cantidad: z.number().int().min(1).max(CANTIDAD_MAXIMA),
      }),
    )
    .min(1)
    .max(ITEMS_MAXIMOS),
});

const localSinConexion = () =>
  new ErrorApi(
    503,
    'LOCAL_SIN_CONEXION',
    'El local no está recibiendo pedidos por acá en este momento. Pedile a la moza.',
  );
const mesaNoEncontrada = () => new ErrorApi(404, 'MESA_NO_ENCONTRADA', 'No encontramos esta mesa.');
const mesaCerrada = () =>
  new ErrorApi(
    409,
    'MESA_CERRADA',
    'La mesa todavía no está habilitada. Pedile a la moza que la habilite.',
  );

type MesaResuelta = {
  id: string;
  nombre: string;
  localId: string;
  local: { nombre: string; slug: string; marca: unknown };
};

/** El token se resuelve sin RLS (no se sabe el local todavía); el resto se lee con el local fijado. */
async function resolverMesa(dbs: Dbs, token: string): Promise<MesaResuelta> {
  const [m] = await dbs.dbAdmin
    .select({
      id: mesas.id,
      nombre: mesas.nombre,
      localId: mesas.localId,
      localNombre: locales.nombre,
      slug: locales.slug,
      marca: locales.marca,
    })
    .from(mesas)
    .innerJoin(locales, eq(locales.id, mesas.localId))
    .where(and(eq(mesas.token, token), isNull(mesas.eliminadoEn)));
  if (!m) throw mesaNoEncontrada();
  return {
    id: m.id,
    nombre: m.nombre,
    localId: m.localId,
    local: { nombre: m.localNombre, slug: m.slug, marca: m.marca },
  };
}

async function sesionAbierta(tx: Tx, mesaId: string) {
  const [s] = await tx
    .select()
    .from(sesionesMesa)
    .where(and(eq(sesionesMesa.mesaId, mesaId), ne(sesionesMesa.estado, 'cerrada')))
    .for('update');
  return s ?? null;
}

async function vistaPedido(tx: Tx, pedidoId: string): Promise<PedidoPublico | null> {
  const [p] = await tx.select().from(pedidos).where(eq(pedidos.id, pedidoId));
  if (!p) return null;
  const items = await tx
    .select()
    .from(itemsPedido)
    .where(
      and(
        eq(itemsPedido.pedidoId, pedidoId),
        eq(itemsPedido.anulado, false),
        isNull(itemsPedido.eliminadoEn),
      ),
    )
    .orderBy(asc(itemsPedido.creadoEn), asc(itemsPedido.id));
  const vista = items.map((i) => ({
    nombre: i.nombre,
    cantidad: i.cantidad,
    resumenOpciones: i.resumenOpciones,
    subtotal: i.precioUnitario * i.cantidad,
  }));
  return {
    id: p.id,
    estado: p.estado,
    motivoRechazo: p.motivoRechazo,
    total: vista.reduce((t, i) => t + i.subtotal, 0),
    items: vista,
  };
}

export async function rutasPublicasSalon(
  app: FastifyInstance,
  { dbs, config }: { dbs: Dbs; config: Config },
) {
  const MINUTO = 60_000;
  const token = (req: FastifyRequest) => (req.params as { token?: string }).token ?? '';
  const limitePedidos = [
    crearLimite(config.rateLimitPedidosIp, MINUTO, (req) => req.ip),
    crearLimite(10, MINUTO, token),
  ];
  const limiteAvisos = [
    crearLimite(config.rateLimitPedidosIp, MINUTO, (req) => req.ip),
    crearLimite(6, MINUTO, token),
  ];

  app.get(
    '/publico/mesas/:token',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply): Promise<MesaPublica> => {
      const { token } = paramToken.parse(req.params);
      const m = await resolverMesa(dbs, token);
      const sesion = await conLocal(dbs.dbApp, m.localId, (tx) => sesionAbierta(tx, m.id));
      const motivo = !sesion
        ? 'mesa_cerrada'
        : app.pcsConectadas(m.localId) === 0
          ? 'local_sin_conexion'
          : null;
      reply.header('cache-control', 'no-store');
      return {
        mesa: { nombre: m.nombre },
        local: { nombre: m.local.nombre, slug: m.local.slug },
        aceptaPedidos: motivo === null,
        motivo,
        sesion: sesion?.id ?? null,
      };
    },
  );

  app.post('/publico/mesas/:token/pedidos', { onRequest: limitePedidos }, async (req, reply) => {
    const { token } = paramToken.parse(req.params);
    const b = cuerpoPedido.parse(req.body);
    const m = await resolverMesa(dbs, token);

    const r = await conLocal(dbs.dbApp, m.localId, async (tx) => {
      // Reintento del mismo envío: se devuelve lo que ya se guardó, aunque la mesa haya cambiado.
      const [previo] = await tx
        .select({ mesaId: pedidos.mesaId })
        .from(pedidos)
        .where(eq(pedidos.id, b.id));
      if (previo) return { creado: false, mesaId: previo.mesaId };

      const sesion = await sesionAbierta(tx, m.id);
      if (!sesion) throw mesaCerrada();
      if (app.pcsConectadas(m.localId) === 0) throw localSinConexion();
      const items = await armarItems(tx, m.local, b.items);
      const insertado = await tx
        .insert(pedidos)
        .values({
          id: b.id,
          localId: m.localId,
          origen: 'qr',
          estado: 'pendiente',
          sesionId: sesion.id,
          mesaId: m.id,
        })
        .onConflictDoNothing()
        .returning({ id: pedidos.id });
      if (!insertado.length) {
        // Otro envío simultáneo con el mismo id ganó la carrera.
        const [otro] = await tx
          .select({ mesaId: pedidos.mesaId })
          .from(pedidos)
          .where(eq(pedidos.id, b.id));
        return { creado: false, mesaId: otro?.mesaId ?? null };
      }
      await tx
        .insert(itemsPedido)
        .values(items.map((i) => ({ id: nuevoId(), localId: m.localId, pedidoId: b.id, ...i })));
      return { creado: true, mesaId: m.id };
    });

    if (r.mesaId !== m.id)
      throw new ErrorApi(409, 'PEDIDO_DUPLICADO', 'Ese pedido ya se envió desde otra mesa.');
    const vista = await conLocal(dbs.dbApp, m.localId, (tx) => vistaPedido(tx, b.id));
    if (r.creado) app.avisar(m.localId, 'salon');
    return reply.status(r.creado ? 201 : 200).send(vista);
  });

  app.get(
    '/publico/pedidos/:id',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const { token } = paramToken.parse(req.query);
      const m = await resolverMesa(dbs, token);
      const vista = await conLocal(dbs.dbApp, m.localId, async (tx) => {
        const [p] = await tx
          .select({ id: pedidos.id })
          .from(pedidos)
          .where(and(eq(pedidos.id, id), eq(pedidos.mesaId, m.id)));
        return p ? vistaPedido(tx, id) : null;
      });
      if (!vista) throw new ErrorApi(404, 'PEDIDO_NO_ENCONTRADO', 'No encontramos ese pedido.');
      reply.header('cache-control', 'no-store');
      return vista;
    },
  );

  app.post('/publico/mesas/:token/avisos', { onRequest: limiteAvisos }, async (req, reply) => {
    const { token } = paramToken.parse(req.params);
    const { tipo } = z.object({ tipo: z.enum(['llamar', 'cuenta']) }).parse(req.body);
    const m = await resolverMesa(dbs, token);
    const r = await conLocal(dbs.dbApp, m.localId, async (tx) => {
      const sesion = await sesionAbierta(tx, m.id);
      if (!sesion) throw mesaCerrada();
      // Sin una PC conectada nadie se enteraría: no se le dice al cliente que se avisó.
      if (app.pcsConectadas(m.localId) === 0) throw localSinConexion();
      const [existente] = await tx
        .select({ id: avisosMesa.id })
        .from(avisosMesa)
        .where(
          and(
            eq(avisosMesa.sesionId, sesion.id),
            eq(avisosMesa.tipo, tipo),
            isNull(avisosMesa.atendidoEn),
          ),
        );
      if (existente) return { creado: false, id: existente.id };
      const id = nuevoId();
      await tx.insert(avisosMesa).values({ id, localId: m.localId, sesionId: sesion.id, tipo });
      if (tipo === 'cuenta')
        await tx
          .update(sesionesMesa)
          .set({ estado: 'cuenta_pedida' })
          .where(eq(sesionesMesa.id, sesion.id));
      return { creado: true, id };
    });
    if (r.creado) app.avisar(m.localId, 'salon');
    return reply.status(r.creado ? 201 : 200).send({ id: r.id, tipo });
  });
}
