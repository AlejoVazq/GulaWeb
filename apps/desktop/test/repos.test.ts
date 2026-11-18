import { afterAll, beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta, fijarDisponibilidadLocal, leerCarta } from '../src/main/db/carta';
import { contarPendientes, encolar, marcarAplicadas, marcarRechazada, pendientes, registrarFallo } from '../src/main/db/outbox';
import { escribirKv, leerKv } from '../src/main/db/kv';
import { carpetaTemporal } from './tmp';
import { T0, T1, pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
beforeEach(() => {
  base = abrirBase(tmp.ruta(`r${n++}.db`));
});
afterAll(() => undefined);

it('aplicar el mismo pull dos veces deja una sola fila y arma la carta', () => {
  aplicarCambiosCarta(base, pullDePrueba());
  aplicarCambiosCarta(base, pullDePrueba());
  const c = leerCarta(base);
  expect(c.categorias).toHaveLength(1);
  expect(c.categorias[0]!.productos[0]).toMatchObject({ nombre: 'Muzza', precio: 1200000, etiquetas: ['vegetariano'], disponible: true });
  expect(c.categorias[0]!.productos[0]!.grupos[0]!.opciones[0]).toMatchObject({ nombre: 'Grande', recargo: 200000 });
  expect(c.sectores).toEqual([{ id: 's1', nombre: 'Cocina', orden: 0 }]);
});

it('una fila más vieja no pisa una más nueva', () => {
  const nuevo = pullDePrueba();
  nuevo.productos[0] = { ...nuevo.productos[0]!, precio: 999, actualizadoEn: T1 };
  aplicarCambiosCarta(base, nuevo);
  aplicarCambiosCarta(base, pullDePrueba()); // trae precio viejo con T0
  expect(leerCarta(base).categorias[0]!.productos[0]!.precio).toBe(999);
});

it('un borrado lógico entrante saca el producto de la carta', () => {
  aplicarCambiosCarta(base, pullDePrueba());
  const borrado = pullDePrueba({ categorias: [], sectores: [], grupos: [], opciones: [] });
  borrado.productos[0] = { ...borrado.productos[0]!, actualizadoEn: T1, eliminadoEn: T1 };
  aplicarCambiosCarta(base, borrado);
  expect(leerCarta(base).categorias[0]!.productos).toEqual([]);
});

it('disponibilidad local optimista', () => {
  aplicarCambiosCarta(base, pullDePrueba());
  fijarDisponibilidadLocal(base, { productoId: 'p1', disponible: false });
  fijarDisponibilidadLocal(base, { opcionId: 'o1', disponible: false });
  const p = leerCarta(base).categorias[0]!.productos[0]!;
  expect(p.disponible).toBe(false);
  expect(p.grupos[0]!.opciones[0]!.disponible).toBe(false);
});

it('outbox: encolar, aplicar, rechazar, fallar', () => {
  const a = encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const b = encolar(base, { tipo: 'x', datos: {} });
  const c = encolar(base, { tipo: 'y', datos: {} });
  expect(pendientes(base).map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  marcarAplicadas(base, [a.id, b.id]);
  expect(contarPendientes(base)).toBe(1);
  registrarFallo(base, [c.id], 'sin conexión');
  expect(pendientes(base)[0]).toMatchObject({ id: c.id, intentos: 1, ultimoError: 'sin conexión' });
  marcarRechazada(base, c.id, 'DATOS_INVALIDOS');
  expect(contarPendientes(base)).toBe(0);
});

it('la outbox sobrevive a cerrar y reabrir la base', () => {
  const ruta = tmp.ruta('persistente.db');
  const b1 = abrirBase(ruta);
  const op = encolar(b1, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: true } });
  b1.cerrar();
  const b2 = abrirBase(ruta);
  expect(pendientes(b2)).toEqual([expect.objectContaining({ id: op.id, datos: { productoId: 'p1', disponible: true } })]);
  b2.cerrar();
});

it('kv', () => {
  expect(leerKv(base, 'cursor')).toBeNull();
  escribirKv(base, 'cursor', T0);
  escribirKv(base, 'cursor', T1);
  expect(leerKv(base, 'cursor')).toBe(T1);
});
