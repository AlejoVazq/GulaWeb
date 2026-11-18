import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { nuevoId } from '@gula/shared';
import type { DbAdmin } from '../db/cliente.js';
import { locales, usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { hashear } from '../seguridad/hash.js';
import * as v from '../validacion.js';

const esquema = z.object({
  nombre: v.nombre,
  slug: v.slug,
  dueno: z.object({ nombre: v.nombre, email: v.email, password: v.password, pin: v.pin }),
});

export type DatosCrearLocal = z.input<typeof esquema>;

export async function crearLocal(
  db: DbAdmin,
  datos: DatosCrearLocal,
): Promise<{ localId: string; duenoId: string }> {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new ErrorApi(400, 'DATOS_INVALIDOS', r.error.issues.map((i) => i.message).join('; '));
  }
  const d = r.data;
  const [passwordHash, pinHash] = await Promise.all([hashear(d.dueno.password), hashear(d.dueno.pin)]);
  const localId = nuevoId();
  const duenoId = nuevoId();

  return db.transaction(async (tx) => {
    const slugUsado = await tx.select({ id: locales.id }).from(locales).where(eq(locales.slug, d.slug));
    if (slugUsado.length) throw new ErrorApi(409, 'SLUG_EN_USO', 'Ya existe un local con ese slug.');
    const emailUsado = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, d.dueno.email));
    if (emailUsado.length) throw new ErrorApi(409, 'EMAIL_EN_USO', 'Ese email ya está registrado.');

    await tx.insert(locales).values({ id: localId, nombre: d.nombre, slug: d.slug });
    await tx.insert(usuarios).values({
      id: duenoId,
      localId,
      nombre: d.dueno.nombre,
      rol: 'dueno',
      email: d.dueno.email,
      passwordHash,
      pinHash,
    });
    return { localId, duenoId };
  });
}
