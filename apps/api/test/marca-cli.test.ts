import { expect, it } from 'vitest';
import { aplicarMarca } from '../src/admin/marca.js';

it('agrega tema, modo, lema y logo sin perder lo que ya había', () => {
  expect(aplicarMarca({ colorAcento: '#111111' }, { tema: 'comanda-bn', modo: 'auto', lema: ' est. 2024 ', logo: '/marcas/gula-hoja.svg' })).toEqual({
    colorAcento: '#111111',
    tema: 'comanda-bn',
    modo: 'auto',
    lema: 'est. 2024',
    logo: '/marcas/gula-hoja.svg',
  });
});

it('el color se guarda como colorAcento', () => {
  expect(aplicarMarca({}, { color: '#b5431c' })).toEqual({ colorAcento: '#b5431c' });
});

it('rechaza valores inválidos con DATOS_INVALIDOS y el mensaje del campo', () => {
  expect(() => aplicarMarca({}, { tema: 'neon' })).toThrow(/tema/i);
  expect(() => aplicarMarca({}, { logo: 'http://x.com/a.png' })).toThrow(expect.objectContaining({ codigo: 'DATOS_INVALIDOS' }));
});
