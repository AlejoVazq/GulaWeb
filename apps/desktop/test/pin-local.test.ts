import { expect, it } from 'vitest';
import { abrirBase } from '../src/main/db/base';
import { leerKv } from '../src/main/db/kv';
import { crearPinLocal } from '../src/main/pinLocal';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let n = 0;
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };

function armar() {
  const base = abrirBase(tmp.ruta(`pin${n++}.db`));
  let reloj = new Date('2026-11-19T12:00:00Z').getTime();
  const pin = crearPinLocal(base, identidad, () => reloj);
  return { base, pin, avanzar: (ms: number) => (reloj += ms) };
}

it('recordar y verificar el PIN correcto da ok', () => {
  const { pin } = armar();
  pin.recordar('u1', '4321');
  expect(pin.tiene('u1')).toBe(true);
  expect(pin.verificar('u1', '4321')).toBe('ok');
  expect(pin.verificar('u1', '0000')).toBe('incorrecto');
});

it('sin verificador responde sin_verificador', () => {
  const { pin } = armar();
  expect(pin.tiene('u9')).toBe(false);
  expect(pin.verificar('u9', '1234')).toBe('sin_verificador');
});

it('5 PIN incorrectos bloquean 5 minutos, incluso con el PIN correcto', () => {
  const { pin, avanzar } = armar();
  pin.recordar('u1', '4321');
  for (let i = 0; i < 4; i++) expect(pin.verificar('u1', '0000')).toBe('incorrecto');
  expect(pin.verificar('u1', '0000')).toBe('bloqueado');
  expect(pin.verificar('u1', '4321')).toBe('bloqueado');
  avanzar(4 * 60_000);
  expect(pin.verificar('u1', '4321')).toBe('bloqueado');
  avanzar(61_000);
  expect(pin.verificar('u1', '4321')).toBe('ok');
  // Tras un acierto los fallos vuelven a cero.
  for (let i = 0; i < 4; i++) expect(pin.verificar('u1', '0000')).toBe('incorrecto');
  expect(pin.verificar('u1', '4321')).toBe('ok');
});

it('el verificador guardado no contiene el PIN en claro y usa sal distinta', () => {
  const { base, pin } = armar();
  pin.recordar('u1', '4321');
  pin.recordar('u2', '4321');
  const a = leerKv(base, 'pin:u1')!;
  const b = leerKv(base, 'pin:u2')!;
  expect(a).not.toContain('4321');
  expect(a).not.toBe(b);
});

it('olvidar y conservarSolo borran verificadores', () => {
  const { pin } = armar();
  pin.recordar('u1', '1111');
  pin.recordar('u2', '2222');
  pin.recordar('u3', '3333');
  pin.olvidar('u1');
  expect(pin.tiene('u1')).toBe(false);
  pin.conservarSolo(['u3']);
  expect(pin.tiene('u2')).toBe(false);
  expect(pin.tiene('u3')).toBe(true);
});
