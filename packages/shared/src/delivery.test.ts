import { describe, expect, it } from 'vitest';
import { avanzaReparto, vuelto } from './delivery.js';

describe('reparto', () => {
  it('solo avanza', () => {
    expect(avanzaReparto('preparando', 'en_camino')).toBe(true);
    expect(avanzaReparto('preparando', 'entregado')).toBe(true);
    expect(avanzaReparto('en_camino', 'preparando')).toBe(false);
    expect(avanzaReparto('entregado', 'entregado')).toBe(false);
    expect(avanzaReparto('entregado', 'en_camino')).toBe(false);
  });

  it('calcula el vuelto', () => {
    expect(vuelto(1250000, 2000000)).toBe(750000);
    expect(vuelto(1000, null)).toBeNull();
    expect(vuelto(1000, 1000)).toBe(0);
    expect(vuelto(1000, 500)).toBeNull();
  });
});
