import { it, expect } from 'vitest';
import { enHorario } from '../src/carta/horario.js';

// Buenos Aires es UTC-3 todo el año.
const enBA = (hhmm: string) => new Date(`2026-11-18T${hhmm}:00-03:00`);

it('horario que cruza medianoche', () => {
  expect(enHorario('20:00', '02:00', enBA('01:00'))).toBe(true);
  expect(enHorario('20:00', '02:00', enBA('21:30'))).toBe(true);
  expect(enHorario('20:00', '02:00', enBA('03:00'))).toBe(false);
});
it('desde inclusivo, hasta exclusivo', () => {
  expect(enHorario('08:00', '12:00', enBA('08:00'))).toBe(true);
  expect(enHorario('08:00', '12:00', enBA('12:00'))).toBe(false);
});
it('sin horario siempre está disponible', () => {
  expect(enHorario(null, null, enBA('04:00'))).toBe(true);
});
