import { it, expect } from 'vitest';
import type { ProductoPublico } from './carta.js';
import { diaOperativo, resumirOpciones } from './salon.js';

const p: ProductoPublico = {
  id: 'h',
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
      max: 3,
      opciones: [
        { id: 'cheddar', nombre: 'Cheddar', recargo: 50000, disponible: true },
        { id: 'huevo', nombre: 'Huevo', recargo: 50000, disponible: true },
        { id: 'bacon', nombre: 'Bacon', recargo: 80000, disponible: true },
      ],
    },
  ],
};

it('diaOperativo: las 02:00 de Buenos Aires pertenecen al día anterior', () => {
  expect(diaOperativo(new Date('2026-11-19T05:00:00Z'))).toBe('2026-11-18');
});

it('diaOperativo: a las 07:00 de Buenos Aires ya es el día nuevo', () => {
  expect(diaOperativo(new Date('2026-11-19T10:00:00Z'))).toBe('2026-11-19');
});

it('diaOperativo: el corte es a las 06:00 exactas', () => {
  expect(diaOperativo(new Date('2026-11-19T08:59:59Z'))).toBe('2026-11-18');
  expect(diaOperativo(new Date('2026-11-19T09:00:00Z'))).toBe('2026-11-19');
});

it('resumirOpciones lista las opciones elegidas en el orden de la carta', () => {
  expect(resumirOpciones(p, { extras: ['bacon', 'cheddar'], tamano: ['grande'] })).toBe('Grande, Cheddar, Bacon');
});

it('resumirOpciones sin opciones da texto vacío', () => {
  expect(resumirOpciones(p, {})).toBe('');
});
