import { describe, expect, it } from 'vitest';
import { diasEntre, periodoAnterior, periodoQueContiene, rangoValido, variacion } from './reportes.js';

describe('períodos', () => {
  it('semana de lunes a domingo', () => {
    expect(periodoQueContiene('semana', '2026-11-18')).toEqual({ desde: '2026-11-16', hasta: '2026-11-22' });
    expect(periodoQueContiene('semana', '2026-11-22')).toEqual({ desde: '2026-11-16', hasta: '2026-11-22' });
    expect(periodoAnterior('semana', { desde: '2026-11-16', hasta: '2026-11-22' })).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
  });

  it('mes y su anterior calendario', () => {
    const m = periodoQueContiene('mes', '2026-03-15');
    expect(m).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' });
    expect(periodoAnterior('mes', m)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(periodoAnterior('mes', { desde: '2026-01-01', hasta: '2026-01-31' })).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
  });

  it('trimestre, semestre y año', () => {
    expect(periodoQueContiene('trimestre', '2026-05-10')).toEqual({ desde: '2026-04-01', hasta: '2026-06-30' });
    expect(periodoAnterior('trimestre', { desde: '2026-01-01', hasta: '2026-03-31' })).toEqual({ desde: '2025-10-01', hasta: '2025-12-31' });
    expect(periodoQueContiene('semestre', '2026-08-01')).toEqual({ desde: '2026-07-01', hasta: '2026-12-31' });
    expect(periodoAnterior('anio', periodoQueContiene('anio', '2026-06-01'))).toEqual({ desde: '2025-01-01', hasta: '2025-12-31' });
  });

  it('personalizado: los mismos días inmediatamente antes', () => {
    expect(periodoAnterior('personalizado', { desde: '2026-11-10', hasta: '2026-11-12' })).toEqual({ desde: '2026-11-07', hasta: '2026-11-09' });
    expect(diasEntre({ desde: '2026-11-10', hasta: '2026-11-12' })).toBe(3);
  });

  it('valida el rango', () => {
    expect(rangoValido({ desde: '2026-11-10', hasta: '2026-11-12' })).toBeNull();
    expect(rangoValido({ desde: '2026-11-12', hasta: '2026-11-10' })).toMatch(/antes/);
    expect(rangoValido({ desde: '2024-01-01', hasta: '2026-01-01' })).toMatch(/366/);
    expect(rangoValido({ desde: '2026-02-30', hasta: '2026-03-01' })).toMatch(/fecha/);
  });

  it('variación', () => {
    expect(variacion(150, 100)).toBe(0.5);
    expect(variacion(5, 0)).toBeNull();
    expect(variacion(0, 0)).toBeNull();
  });
});
