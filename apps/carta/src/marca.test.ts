import { expect, it } from 'vitest';
import { leerMarca } from '@gula/shared';
import { atributosTema, estiloMarca } from './marca';

it('atributosTema expone tema y modo como data-*', () => {
  expect(atributosTema(leerMarca({ modo: 'oscuro' }))).toEqual({ 'data-tema': 'comanda-bn', 'data-modo': 'oscuro' });
  expect(atributosTema(leerMarca({}))).toEqual({ 'data-tema': 'comanda-bn', 'data-modo': 'auto' });
});

it('estiloMarca pasa el color de acento válido como variable', () => {
  expect(estiloMarca(leerMarca({ colorAcento: '#123456' }))).toEqual({ '--color-acento': '#123456' });
  expect(estiloMarca(leerMarca({}))).toEqual({});
});
