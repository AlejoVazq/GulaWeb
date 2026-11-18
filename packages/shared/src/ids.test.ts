import { describe, it, expect } from 'vitest';
import { nuevoId, esId } from './ids.js';

describe('ids', () => {
  it('genera UUIDv7 válidos y ordenables por tiempo', () => {
    const a = nuevoId();
    const b = nuevoId();
    expect(esId(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
  });
  it('esId rechaza valores que no son UUID', () => {
    expect(esId('hola')).toBe(false);
    expect(esId(123)).toBe(false);
  });
});
