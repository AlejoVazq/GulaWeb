import type { FastifyInstance } from 'fastify';
import { and, asc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId, ROLES } from '@gula/shared';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { hashear } from '../seguridad/hash.js';
import { registrarAuditoria } from '../auditoria/registrar.js';
import * as v from '../validacion.js';

type FilaUsuario = typeof usuarios.$inferSelect;

/** Vista pública de un usuario: nunca incluye hashes ni contadores de PIN. */
const publico = (u: FilaUsuario) => ({
  id: u.id,
  nombre: u.nombre,
  rol: u.rol,
  email: u.email,
  activo: u.activo,
});

const cuerpoCrear = z
  .object({
    nombre: v.nombre,
    rol: z.enum(ROLES),
    pin: v.pin,
    email: v.email.optional(),
    password: v.password.optional(),
  })
  .refine((d) => d.rol === 'mesero' || (d.email && d.password), {
    message: 'Dueño y encargado necesitan email y contraseña',
  });

const cuerpoEditar = z.object({
  nombre: v.nombre.optional(),
  rol: z.enum(ROLES).optional(),
  pin: v.pin.optional(),
  activo: z.boolean().optional(),
  email: v.email.optional(),
  password: v.password.optional(),
});

const noEncontrado = () => new ErrorApi(404, 'NO_ENCONTRADO', 'No encontramos ese usuario.');

async function emailLibre(dbs: Dbs, email: string, exceptoId?: string): Promise<void> {
  // El email es único entre todos los locales: se consulta sin RLS.
  const filtro = exceptoId
    ? and(eq(usuarios.email, email), ne(usuarios.id, exceptoId))
    : eq(usuarios.email, email);
  const usados = await dbs.dbAdmin.select({ id: usuarios.id }).from(usuarios).where(filtro);
  if (usados.length) throw new ErrorApi(409, 'EMAIL_EN_USO', 'Ese email ya está registrado.');
}

/** Bloquea las filas de dueños activos (en orden fijo) para serializar cambios concurrentes. */
async function duenosActivos(tx: Tx): Promise<number> {
  const filas = await tx
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.rol, 'dueno'), eq(usuarios.activo, true)))
    .orderBy(asc(usuarios.id))
    .for('update');
  return filas.length;
}

export async function rutasUsuarios(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('admin.configurar')] };

  app.get('/usuarios', pre, async (req) =>
    conLocal(dbs.dbApp, req.sesion.localId, async (tx) =>
      (await tx.select().from(usuarios).orderBy(asc(usuarios.nombre))).map(publico),
    ),
  );

  app.post('/usuarios', pre, async (req, reply) => {
    const b = cuerpoCrear.parse(req.body);
    if (b.email) await emailLibre(dbs, b.email);
    const [pinHash, passwordHash] = await Promise.all([
      hashear(b.pin),
      b.password ? hashear(b.password) : Promise.resolve(null),
    ]);
    const creado = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const [u] = await tx
        .insert(usuarios)
        .values({
          id: nuevoId(),
          localId: req.sesion.localId,
          nombre: b.nombre,
          rol: b.rol,
          email: b.email ?? null,
          passwordHash,
          pinHash,
        })
        .returning();
      await registrarAuditoria(tx, {
        sesion: req.sesion,
        accion: 'usuario.crear',
        entidad: 'usuario',
        entidadId: u!.id,
        despues: publico(u!),
      });
      return u!;
    });
    return reply.status(201).send(publico(creado));
  });

  app.patch('/usuarios/:id', pre, async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const b = cuerpoEditar.parse(req.body);
    if (b.email) await emailLibre(dbs, b.email, id);
    const [pinHash, passwordHash] = await Promise.all([
      b.pin ? hashear(b.pin) : Promise.resolve(undefined),
      b.password ? hashear(b.password) : Promise.resolve(undefined),
    ]);

    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const cantidadDuenos = await duenosActivos(tx);
      const [antes] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).for('update');
      if (!antes) throw noEncontrado();

      const dejaDeSerDueno =
        antes.rol === 'dueno' &&
        antes.activo &&
        (b.activo === false || (b.rol && b.rol !== 'dueno'));
      if (dejaDeSerDueno && cantidadDuenos <= 1) {
        throw new ErrorApi(
          409,
          'ULTIMO_DUENO',
          'El local tiene que tener al menos un dueño activo.',
        );
      }

      const [despues] = await tx
        .update(usuarios)
        .set({
          nombre: b.nombre,
          rol: b.rol,
          activo: b.activo,
          email: b.email,
          pinHash,
          passwordHash,
          ...(pinHash ? { pinFallos: 0, pinBloqueadoHasta: null } : {}),
        })
        .where(eq(usuarios.id, id))
        .returning();
      await registrarAuditoria(tx, {
        sesion: req.sesion,
        accion: 'usuario.editar',
        entidad: 'usuario',
        entidadId: id,
        antes: publico(antes),
        despues: {
          ...publico(despues!),
          pinCambiado: Boolean(pinHash),
          passwordCambiada: Boolean(passwordHash),
        },
      });
      return publico(despues!);
    });
  });
}
