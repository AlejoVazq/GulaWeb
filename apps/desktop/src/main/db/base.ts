import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from './migraciones';

export type BaseLocal = {
  db: DatabaseSync;
  versionEsquema: number;
  /** Ejecuta fn en una transacción (BEGIN IMMEDIATE … COMMIT/ROLLBACK). */
  transaccion<T>(fn: () => T): T;
  cerrar(): void;
};

export function abrirBase(ruta: string): BaseLocal {
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

  const transaccion = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  db.exec('CREATE TABLE IF NOT EXISTS migraciones (version INTEGER PRIMARY KEY, aplicada_en TEXT NOT NULL)');
  const { v } = db.prepare('SELECT coalesce(max(version), 0) AS v FROM migraciones').get() as { v: number };
  for (let i = v; i < MIGRACIONES.length; i++) {
    transaccion(() => {
      db.exec(MIGRACIONES[i]!);
      db.prepare('INSERT INTO migraciones (version, aplicada_en) VALUES (?, ?)').run(i + 1, new Date().toISOString());
    });
  }
  return { db, versionEsquema: MIGRACIONES.length, transaccion, cerrar: () => db.close() };
}
