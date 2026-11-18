import { it, expect } from 'vitest';
import { reducirCarrito, type ItemCarrito } from './carrito';

const item = (extra: Partial<ItemCarrito> = {}): ItemCarrito => ({
  clave: '',
  productoId: 'p1',
  nombre: 'Hamburguesa',
  seleccion: { tamano: ['grande'] },
  resumenOpciones: 'Grande',
  nota: '',
  cantidad: 1,
  precioUnitario: 650000,
  ...extra,
});

it('agregar el mismo producto con la misma selección y nota suma cantidad', () => {
  let e = reducirCarrito([], { tipo: 'agregar', item: item() });
  e = reducirCarrito(e, { tipo: 'agregar', item: item({ cantidad: 2 }) });
  expect(e).toHaveLength(1);
  expect(e[0]!.cantidad).toBe(3);
});
it('distinta nota o selección no suma', () => {
  let e = reducirCarrito([], { tipo: 'agregar', item: item() });
  e = reducirCarrito(e, { tipo: 'agregar', item: item({ nota: 'sin cebolla' }) });
  e = reducirCarrito(e, { tipo: 'agregar', item: item({ seleccion: { tamano: ['simple'] } }) });
  expect(e).toHaveLength(3);
});
it('la selección no depende del orden de las opciones', () => {
  let e = reducirCarrito([], { tipo: 'agregar', item: item({ seleccion: { x: ['a', 'b'] } }) });
  e = reducirCarrito(e, { tipo: 'agregar', item: item({ seleccion: { x: ['b', 'a'] } }) });
  expect(e).toHaveLength(1);
});
it('cantidad 0 quita, quitar y vaciar', () => {
  let e = reducirCarrito([], { tipo: 'agregar', item: item() });
  e = reducirCarrito(e, { tipo: 'agregar', item: item({ nota: 'x' }) });
  e = reducirCarrito(e, { tipo: 'cantidad', clave: e[0]!.clave, cantidad: 0 });
  expect(e).toHaveLength(1);
  e = reducirCarrito(e, { tipo: 'quitar', clave: e[0]!.clave });
  expect(e).toEqual([]);
  e = reducirCarrito(reducirCarrito([], { tipo: 'agregar', item: item() }), { tipo: 'vaciar' });
  expect(e).toEqual([]);
});
