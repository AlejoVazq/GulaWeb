import { afterEach, expect, it } from 'vitest';
import { abrirBase } from '../src/main/db/base';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
afterEach(() => undefined);

it('crea las tablas locales', () => {
  const base = abrirBase(tmp.ruta('a.db'));
  const tablas = base.db
    .prepare("select name from sqlite_master where type='table' order by name")
    .all()
    .map((f) => (f as { name: string }).name);
  for (const t of ['kv', 'sectores', 'categorias', 'productos', 'grupos', 'opciones', 'outbox', 'migraciones']) {
    expect(tablas).toContain(t);
  }
  base.cerrar();
});

it('reabrir no re-aplica migraciones y usa WAL', () => {
  const ruta = tmp.ruta('b.db');
  abrirBase(ruta).cerrar();
  const base = abrirBase(ruta);
  const versiones = base.db.prepare('select count(*) as n from migraciones').get() as { n: number };
  expect(versiones.n).toBe(base.versionEsquema);
  const modo = base.db.prepare('pragma journal_mode').get() as { journal_mode: string };
  expect(modo.journal_mode).toBe('wal');
  base.cerrar();
});

it('una transacción anidada se deshace junto con la de afuera', () => {
  const b = abrirBase(tmp.ruta('anidada.db'));
  expect(() =>
    b.transaccion(() => {
      b.transaccion(() => b.db.exec("INSERT INTO kv (clave, valor) VALUES ('x', '1')"));
      throw new Error('falla afuera');
    }),
  ).toThrow('falla afuera');
  expect(b.db.prepare("SELECT count(*) AS n FROM kv WHERE clave = 'x'").get()).toEqual({ n: 0 });
  b.cerrar();
});
