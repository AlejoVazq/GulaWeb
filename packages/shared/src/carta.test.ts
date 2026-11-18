import { it, expect } from 'vitest';
import { precioUnitario, validarSeleccion, type ProductoPublico } from './carta.js';

const p: ProductoPublico = {
  id: 'hamburguesa',
  nombre: 'Hamburguesa',
  descripcion: null,
  precio: 500000,
  foto: null,
  disponible: true,
  etiquetas: [],
  grupos: [
    {
      id: 'tamano',
      nombre: 'Tamaño',
      min: 1,
      max: 1,
      opciones: [
        { id: 'chica', nombre: 'Chica', recargo: 0, disponible: true },
        { id: 'grande', nombre: 'Grande', recargo: 150000, disponible: true },
      ],
    },
    {
      id: 'extras',
      nombre: 'Extras',
      min: 0,
      max: 2,
      opciones: [
        { id: 'cheddar', nombre: 'Cheddar', recargo: 80000, disponible: true },
        { id: 'bacon', nombre: 'Bacon', recargo: 100000, disponible: true },
        { id: 'huevo', nombre: 'Huevo', recargo: 50000, disponible: false },
      ],
    },
  ],
};

it('grupo obligatorio sin elegir', () => {
  expect(validarSeleccion(p, {})).toEqual({ ok: false, errores: ['Elegí una opción en "Tamaño"'] });
});
it('selección válida', () => {
  expect(validarSeleccion(p, { tamano: ['grande'] })).toEqual({ ok: true });
});
it('opciones repetidas o de más', () => {
  expect(validarSeleccion(p, { tamano: ['grande'], extras: ['cheddar', 'bacon', 'cheddar'] }).ok).toBe(false);
  expect(validarSeleccion(p, { tamano: ['chica', 'grande'] })).toEqual({
    ok: false,
    errores: ['Podés elegir hasta 1 en "Tamaño"'],
  });
});
it('opción no disponible', () => {
  expect(validarSeleccion(p, { tamano: ['chica'], extras: ['huevo'] })).toEqual({
    ok: false,
    errores: ['"Huevo" no está disponible'],
  });
});
it('grupo u opción desconocidos', () => {
  expect(validarSeleccion(p, { tamano: ['chica'], otro: ['x'] }).ok).toBe(false);
  expect(validarSeleccion(p, { tamano: ['mediana'] }).ok).toBe(false);
});
it('mínimo mayor a uno', () => {
  const q = { ...p, grupos: [{ ...p.grupos[1]!, min: 2, max: 3 }] };
  expect(validarSeleccion(q, { extras: ['cheddar'] })).toEqual({
    ok: false,
    errores: ['Elegí al menos 2 en "Extras"'],
  });
});
it('precio unitario suma recargos', () => {
  expect(precioUnitario(p, { tamano: ['grande'], extras: ['cheddar', 'bacon'] })).toBe(830000);
  expect(precioUnitario(p, { tamano: ['chica'] })).toBe(500000);
});
