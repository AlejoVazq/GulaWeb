import { it, expect, beforeEach, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { crearLocal, type DatosCrearLocal } from '../src/locales/crearLocal.js';
import { verificarHash } from '../src/seguridad/hash.js';
import { usuarios } from '../src/db/schema/index.js';
import { dbs, limpiarDb } from './db.js';

const { dbAdmin } = dbs;
beforeEach(limpiarDb);
afterAll(() => dbs.cerrar());

function datosValidos(o: { slug?: string; email?: string } = {}): DatosCrearLocal {
  return {
    nombre: 'La Gula',
    slug: o.slug ?? 'la-gula',
    dueno: { nombre: 'Ale', email: o.email ?? 'dueno@local.com', password: 'secreto123', pin: '1234' },
  };
}

it('crea local y dueño con secretos hasheados', async () => {
  const r = await crearLocal(dbAdmin, datosValidos({ slug: 'la-gula', email: ' Dueno@Local.com ' }));
  const [u] = await dbAdmin.select().from(usuarios).where(eq(usuarios.id, r.duenoId));
  expect(u!.rol).toBe('dueno');
  expect(u!.email).toBe('dueno@local.com');
  expect(u!.passwordHash).not.toContain('secreto123');
  expect(await verificarHash(u!.pinHash, '1234')).toBe(true);
});
it('rechaza slug inválido', async () => {
  await expect(crearLocal(dbAdmin, datosValidos({ slug: 'Mi Local' }))).rejects.toMatchObject({
    codigo: 'DATOS_INVALIDOS',
  });
});
it('rechaza slug repetido', async () => {
  await crearLocal(dbAdmin, datosValidos({ slug: 'la-gula' }));
  await expect(
    crearLocal(dbAdmin, datosValidos({ slug: 'la-gula', email: 'otro@x.com' })),
  ).rejects.toMatchObject({ codigo: 'SLUG_EN_USO' });
});
it('rechaza email repetido aunque cambie mayúsculas', async () => {
  await crearLocal(dbAdmin, datosValidos({ slug: 'uno', email: 'a@x.com' }));
  await expect(
    crearLocal(dbAdmin, datosValidos({ slug: 'dos', email: 'A@X.com' })),
  ).rejects.toMatchObject({ codigo: 'EMAIL_EN_USO' });
});
