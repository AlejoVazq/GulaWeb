import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { crearDb } from './cliente.js';

export const carpetaMigraciones = fileURLToPath(new URL('./migraciones', import.meta.url));

export async function migrar(databaseAdminUrl: string): Promise<void> {
  const dbs = crearDb({ databaseAdminUrl, databaseUrl: databaseAdminUrl });
  try {
    await migrate(dbs.dbAdmin, { migrationsFolder: carpetaMigraciones });
  } finally {
    await dbs.cerrar();
  }
}

