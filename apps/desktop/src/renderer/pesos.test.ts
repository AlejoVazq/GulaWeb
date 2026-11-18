import { expect, it } from 'vitest';
import { centavosAPesos, parsearPesos } from './pesos';

it('parsea pesos argentinos a centavos', () => {
  expect(parsearPesos('2.500,50')).toBe(250050);
  expect(parsearPesos('2500')).toBe(250000);
  expect(parsearPesos('$ 12.000')).toBe(1200000);
  expect(parsearPesos('0,5')).toBe(50);
  expect(parsearPesos('abc')).toBeNull();
  expect(parsearPesos('-5')).toBeNull();
  expect(parsearPesos('')).toBeNull();
  expect(parsearPesos('1,234')).toBeNull();
});
it('centavos a texto editable', () => {
  expect(centavosAPesos(250050)).toBe('2500,50');
  expect(centavosAPesos(250000)).toBe('2500');
});
