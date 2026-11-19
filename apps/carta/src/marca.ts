import type { CSSProperties } from 'react';
import type { Marca, ModoMarca, Tema } from '@gula/shared';

/** Atributos de la raíz de la carta: el CSS de cada tema cuelga de data-tema y data-modo. */
export function atributosTema(m: Marca): { 'data-tema': Tema; 'data-modo': ModoMarca } {
  return { 'data-tema': m.tema, 'data-modo': m.modo };
}

export function estiloMarca(m: Marca): CSSProperties {
  return m.colorAcento ? ({ '--color-acento': m.colorAcento } as CSSProperties) : {};
}
