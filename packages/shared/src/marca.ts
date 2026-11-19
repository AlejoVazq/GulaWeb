/** Marca de un local (`locales.marca`): tema prearmado y unos pocos ajustes. Todo validado. */
export const TEMAS = ['comanda-bn'] as const;
export type Tema = (typeof TEMAS)[number];
export type ModoMarca = 'auto' | 'claro' | 'oscuro';
export type Marca = { tema: Tema; modo: ModoMarca; logo?: string; lema?: string; colorAcento?: string };

const MODOS: readonly ModoMarca[] = ['auto', 'claro', 'oscuro'];
const HEX = /^#[0-9a-f]{6}$/i;
// Solo rutas propias (/fotos/..., /marcas/...) o https: nada de javascript:, data: ni http plano.
const URL_LOGO = /^(\/[\w\-./]+|https:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/;
const LEMA_MAX = 40;

export type CampoMarca = 'tema' | 'modo' | 'logo' | 'lema' | 'color';

/** Mensaje de error para un valor de marca, o null si es válido. */
export function validarCampoMarca(campo: CampoMarca, valor: string): string | null {
  switch (campo) {
    case 'tema':
      return (TEMAS as readonly string[]).includes(valor) ? null : `El tema tiene que ser uno de: ${TEMAS.join(', ')}.`;
    case 'modo':
      return (MODOS as readonly string[]).includes(valor) ? null : 'El modo va como auto, claro u oscuro.';
    case 'logo':
      return URL_LOGO.test(valor) ? null : 'El logo va como /fotos/..., /marcas/... o https://...';
    case 'lema': {
      const t = valor.trim();
      return t.length >= 1 && t.length <= LEMA_MAX ? null : `El lema va de 1 a ${LEMA_MAX} caracteres.`;
    }
    case 'color':
      return HEX.test(valor) ? null : 'El color va como #rrggbb.';
  }
}

const valido = (campo: CampoMarca, v: unknown): v is string => typeof v === 'string' && validarCampoMarca(campo, v) === null;

/** Lee la marca guardada; nunca lanza, lo inválido se descarta y se usan los valores por defecto. */
export function leerMarca(marca: unknown): Marca {
  const m = marca && typeof marca === 'object' && !Array.isArray(marca) ? (marca as Record<string, unknown>) : {};
  const r: Marca = { tema: valido('tema', m.tema) ? (m.tema as Tema) : 'comanda-bn', modo: valido('modo', m.modo) ? (m.modo as ModoMarca) : 'auto' };
  if (valido('logo', m.logo)) r.logo = m.logo;
  if (valido('lema', m.lema)) r.lema = m.lema.trim();
  if (valido('color', m.colorAcento)) r.colorAcento = m.colorAcento;
  return r;
}
