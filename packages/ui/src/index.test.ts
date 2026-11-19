import { expect, it } from 'vitest';
import * as ui from './index';

it('exporta PapelComanda y selloDeEstado', () => {
  expect(typeof ui.PapelComanda).toBe('function');
  expect(typeof ui.selloDeEstado).toBe('function');
});
