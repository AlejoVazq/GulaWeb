import { sql } from 'drizzle-orm';
import type { DbApp, Tx } from './cliente.js';

/** Ejecuta fn en una transacción con app.local_id fijado (RLS). */
export function conLocal<T>(db: DbApp, localId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.local_id', ${localId}, true)`);
    return fn(tx);
  });
}
