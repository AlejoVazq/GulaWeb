import type { CSSProperties } from 'react';

/** Marca del local (`locales.marca`): color de acento y logo. Todo opcional y validado. */
export type Marca = { colorAcento?: string; logo?: string };

const HEX = /^#[0-9a-f]{6}$/i;
// Solo rutas propias (/fotos/...) o https: nada de javascript:, data: ni http plano.
const URL_LOGO = /^(\/[\w\-./]+|https:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;

export function leerMarca(marca: Record<string, unknown> | undefined): Marca {
  const m: Marca = {};
  if (typeof marca?.colorAcento === 'string' && HEX.test(marca.colorAcento)) m.colorAcento = marca.colorAcento;
  if (typeof marca?.logo === 'string' && URL_LOGO.test(marca.logo)) m.logo = marca.logo;
  return m;
}

export function estiloMarca(m: Marca): CSSProperties {
  return m.colorAcento ? ({ '--color-acento': m.colorAcento } as CSSProperties) : {};
}
