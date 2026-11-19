import { expect, it } from 'vitest';
import { describirRechazo } from '../src/compartido/rechazos';

const op = (tipo: string, error: string, datos: unknown = {}, lugar: string | null = null) => ({
  id: 'o1',
  tipo,
  datos,
  error,
  creadaEn: '2026-11-19T20:00:00.000Z',
  lugar,
});

it('mesa.abrir rechazada porque la mesa ya no existe', () => {
  expect(describirRechazo(op('mesa.abrir', 'NO_ENCONTRADO', { mesaId: 'm4' }, 'Mesa 4'))).toBe(
    'No se pudo abrir la Mesa 4: la mesa ya no existe.',
  );
});

it('cuenta.cobrar rechazada con la caja cerrada', () => {
  expect(describirRechazo(op('cuenta.cobrar', 'CAJA_CERRADA', { subtotal: 1400000 }, 'Mesa 4'))).toBe(
    'El cobro de la Mesa 4 no se registró: la caja ya estaba cerrada.',
  );
  expect(describirRechazo(op('cuenta.cobrar', 'CAJA_CERRADA', { subtotal: 1400000 }))).toBe(
    'El cobro de $ 14.000 no se registró: la caja ya estaba cerrada.',
  );
});

it('pedido.crear de una mesa que ya no existe', () => {
  expect(describirRechazo(op('pedido.crear', 'NO_ENCONTRADO', {}, 'Mesa 4'))).toBe(
    'El pedido de la Mesa 4 no se guardó: la mesa ya no existe.',
  );
});

it('un error del servidor pide avisar al soporte', () => {
  expect(describirRechazo(op('pedido.crear', 'ERROR_INTERNO', {}, 'Mesa 2'))).toBe(
    'El pedido de la Mesa 2 no se guardó: el servidor no pudo aplicarlo; avisá al soporte.',
  );
});

it('tipo desconocido: frase genérica con el código', () => {
  expect(describirRechazo(op('nave.despegar', 'DATOS_INVALIDOS'))).toBe('Un cambio no se pudo guardar en el servidor (DATOS_INVALIDOS).');
  expect(describirRechazo(op('nave.despegar', 'ERROR_SERVIDOR'))).toBe(
    'Un cambio no se pudo guardar en el servidor (ERROR_SERVIDOR); avisá al soporte.',
  );
});
