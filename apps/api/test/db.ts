import { sql } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { crearDb } from '../src/db/cliente.js';
import { locales, usuarios } from '../src/db/schema/index.js';
import { configDePrueba } from './helpers.js';

export const dbs = crearDb(configDePrueba());

export async function limpiarDb(): Promise<void> {
  await dbs.dbAdmin.execute(
    sql`TRUNCATE auditoria, refresh_tokens, dispositivos, usuarios, locales CASCADE`,
  );
}

/** Inserta un local con su dueño directamente (sin pasar por la API). */
export async function crearLocalDePrueba(slug: string): Promise<{ localId: string; duenoId: string }> {
  const localId = nuevoId();
  const duenoId = nuevoId();
  await dbs.dbAdmin.insert(locales).values({ id: localId, nombre: `Local ${slug}`, slug });
  await dbs.dbAdmin.insert(usuarios).values({
    id: duenoId,
    localId,
    nombre: 'Dueño',
    rol: 'dueno',
    email: `dueno@${slug}.com`,
    pinHash: 'sin-pin',
  });
  return { localId, duenoId };
}
