import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Db = PostgresJsDatabase<typeof schema>;
/** Conexión como dueño de las tablas: solo migraciones, CLI y búsquedas de login. */
export type DbAdmin = Db & { readonly __rol?: 'admin' };
/** Conexión con el rol gula_app, sujeta a RLS. */
export type DbApp = Db & { readonly __rol?: 'app' };
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type Dbs = { dbAdmin: DbAdmin; dbApp: DbApp; cerrar: () => Promise<void> };

export function crearDb(config: { databaseUrl: string; databaseAdminUrl: string }): Dbs {
  const sqlAdmin = postgres(config.databaseAdminUrl, { max: 3, onnotice: () => {} });
  const sqlApp = postgres(config.databaseUrl, { max: 10, onnotice: () => {} });
  return {
    dbAdmin: drizzle(sqlAdmin, { schema }),
    dbApp: drizzle(sqlApp, { schema }),
    cerrar: async () => {
      await Promise.all([sqlAdmin.end(), sqlApp.end()]);
    },
  };
}
