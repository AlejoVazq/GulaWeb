import { expect, it } from 'vitest';
import { estiloMarca, leerMarca } from './marca';

it('toma color y logo válidos', () => {
  expect(leerMarca({ colorAcento: '#1A7f3c', logo: '/fotos/l1/logo.webp' })).toEqual({ colorAcento: '#1A7f3c', logo: '/fotos/l1/logo.webp' });
  expect(estiloMarca({ colorAcento: '#123456' })).toEqual({ '--color-acento': '#123456' });
});

it('ignora valores peligrosos o mal formados', () => {
  expect(leerMarca({ colorAcento: 'red;background:url(x)', logo: 'javascript:alert(1)' })).toEqual({});
  expect(leerMarca({ logo: 'http://x.com/a.png' })).toEqual({});
  expect(leerMarca(undefined)).toEqual({});
});
