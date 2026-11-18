import { expect, it } from 'vitest';
import { esFramePropio, esUrlExternaPermitida } from '../src/main/seguridad';
import { crearVigia } from '../src/main/vigia';

it('solo abre afuera enlaces https', () => {
  expect(esUrlExternaPermitida('https://gula.com.ar/ayuda')).toBe(true);
  expect(esUrlExternaPermitida('http://gula.com.ar')).toBe(false);
  expect(esUrlExternaPermitida('file:///C:/Windows/system32/calc.exe')).toBe(false);
  expect(esUrlExternaPermitida('javascript:alert(1)')).toBe(false);
  expect(esUrlExternaPermitida('no es url')).toBe(false);
});

it('reconoce el frame propio de la app', () => {
  expect(esFramePropio('file:///C:/app/out/renderer/index.html', undefined)).toBe(true);
  expect(esFramePropio('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
  expect(esFramePropio('https://malo.com/', 'http://localhost:5173')).toBe(false);
  expect(esFramePropio('https://malo.com/', undefined)).toBe(false);
});

it('el vigía solo cuenta actividad del usuario, no lecturas automáticas', () => {
  let ahora = 0;
  const v = crearVigia(5, () => ahora);
  ahora = 4 * 60_000;
  v.registrar('carta:leer');
  v.registrar('sync:estado');
  ahora = 6 * 60_000;
  expect(v.inactivo()).toBe(true);
  v.registrar('sesion:actividad');
  expect(v.inactivo()).toBe(false);
  ahora = 12 * 60_000;
  v.registrar('carta:disponibilidad');
  expect(v.inactivo()).toBe(false);
});
