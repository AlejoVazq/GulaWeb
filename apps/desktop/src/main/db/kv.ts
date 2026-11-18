import type { BaseLocal } from './base';

export function leerKv(base: BaseLocal, clave: string): string | null {
  const f = base.db.prepare('SELECT valor FROM kv WHERE clave = ?').get(clave) as { valor: string } | undefined;
  return f?.valor ?? null;
}

export function escribirKv(base: BaseLocal, clave: string, valor: string): void {
  base.db
    .prepare('INSERT INTO kv (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
    .run(clave, valor);
}

export function borrarKv(base: BaseLocal, clave: string): void {
  base.db.prepare('DELETE FROM kv WHERE clave = ?').run(clave);
}
