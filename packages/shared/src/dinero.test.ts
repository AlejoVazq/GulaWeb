import { it, expect } from 'vitest';
import { formatearPrecio } from './dinero.js';

it('formatea centavos como pesos argentinos', () => {
  expect(formatearPrecio(250000)).toBe('$ 2.500');
  expect(formatearPrecio(250050)).toBe('$ 2.500,50');
  expect(formatearPrecio(0)).toBe('$ 0');
  expect(formatearPrecio(123456789)).toBe('$ 1.234.567,89');
  expect(formatearPrecio(5)).toBe('$ 0,05');
});
