/** Modelo de ticket independiente del ancho: lo usan el codificador ESC/POS (main) y la vista previa. */
export type Tam = 'normal' | 'alto' | 'doble';
export type Alinear = 'izq' | 'centro' | 'der';

export type Linea =
  | { tipo: 'texto'; texto: string; alinear?: Alinear; tam?: Tam; negrita?: boolean; sangria?: number }
  | { tipo: 'par'; izq: string; der: string; negrita?: boolean; tam?: 'normal' | 'alto' }
  | { tipo: 'separador' }
  | { tipo: 'espacio' };

export type Documento = { titulo: string; lineas: Linea[] };

/** Un renglón ya cortado al ancho del papel. */
export type Renglon = { texto: string; tam: Tam; negrita: boolean; alinear: Alinear };

export type ConfigImpresion = { modo: 'impresora' | 'vista_previa'; impresora: string | null; columnas: 48 | 32 };
export const CONFIG_IMPRESION_POR_DEFECTO: ConfigImpresion = { modo: 'vista_previa', impresora: null, columnas: 48 };

export type TipoImpresion = 'comanda' | 'cuenta' | 'prueba' | 'cierre';
export type EstadoImpresion = 'pendiente' | 'imprimiendo' | 'impresa' | 'error' | 'descartada';
export type TrabajoImpresion = {
  id: string;
  tipo: TipoImpresion;
  pedidoId: string | null;
  titulo: string;
  estado: EstadoImpresion;
  error: string | null;
  creadaEn: string;
  impresaEn: string | null;
};

/** Caracteres de la página de códigos 850 (además del ASCII imprimible) y su byte. */
export const CP850: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b,
  î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97,
  ÿ: 0x98, Ö: 0x99, Ü: 0x9a, ø: 0x9b, '£': 0x9c, Ø: 0x9d, '×': 0x9e, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3,
  ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7, '¿': 0xa8, '®': 0xa9, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae,
  '»': 0xaf, Á: 0xb5, Â: 0xb6, À: 0xb7, '©': 0xb8, '¢': 0xbd, ã: 0xc6, Ã: 0xc7, Ê: 0xd2, Ë: 0xd3, È: 0xd4,
  Í: 0xd6, Î: 0xd7, Ï: 0xd8, Ì: 0xde, Ó: 0xe0, ß: 0xe1, Ô: 0xe2, Ò: 0xe3, õ: 0xe4, Õ: 0xe5, µ: 0xe6, Ú: 0xe9,
  Û: 0xea, Ù: 0xeb, '±': 0xf1, '§': 0xf5, '÷': 0xf6, '°': 0xf8, '·': 0xfa,
};

const EQUIVALENTES: Record<string, string> = {
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'", '–': '-', '—': '-', '…': '...', '€': 'EUR',
  '\t': ' ', ' ': ' ',
};

/** Texto que la impresora puede mostrar tal cual: lo que no está en CP850 se translitera o pasa a `?`. */
export function imprimible(texto: string): string {
  let r = '';
  // NFC primero (una "e" + tilde combinable es "é"); los controles nunca pasan: serían comandos ESC/POS.
  for (const c of texto.normalize('NFC')) {
    const cp = c.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) r += ' ';
    else if (cp < 0x7f || c in CP850) r += c;
    else if (c in EQUIVALENTES) r += EQUIVALENTES[c];
    else {
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      r += base.length === 1 && base.codePointAt(0)! < 0x7f ? base : '?';
    }
  }
  return r;
}

/** Corta por palabra; una palabra más larga que el ancho se parte. */
function cortar(texto: string, ancho: number): string[] {
  const renglones: string[] = [];
  let actual = '';
  for (let palabra of texto.split(' ').filter(Boolean)) {
    while (palabra.length > ancho) {
      if (actual) {
        renglones.push(actual);
        actual = '';
      }
      renglones.push(palabra.slice(0, ancho));
      palabra = palabra.slice(ancho);
    }
    if (!palabra) continue;
    if (!actual) actual = palabra;
    else if (actual.length + 1 + palabra.length <= ancho) actual += ` ${palabra}`;
    else {
      renglones.push(actual);
      actual = palabra;
    }
  }
  if (actual || !renglones.length) renglones.push(actual);
  return renglones;
}

export function maquetar(doc: Documento, columnas: number): Renglon[] {
  const r: Renglon[] = [];
  for (const l of doc.lineas) {
    if (l.tipo === 'separador') r.push({ texto: '-'.repeat(columnas), tam: 'normal', negrita: false, alinear: 'izq' });
    else if (l.tipo === 'espacio') r.push({ texto: '', tam: 'normal', negrita: false, alinear: 'izq' });
    else if (l.tipo === 'texto') {
      const tam = l.tam ?? 'normal';
      const ancho = tam === 'doble' ? Math.floor(columnas / 2) : columnas;
      const sangria = ' '.repeat(Math.min(l.sangria ?? 0, 8));
      for (const t of cortar(imprimible(l.texto), ancho - sangria.length))
        r.push({ texto: sangria + t, tam, negrita: !!l.negrita, alinear: l.alinear ?? 'izq' });
    } else {
      const der = imprimible(l.der);
      const base = { tam: l.tam ?? 'normal', negrita: !!l.negrita, alinear: 'izq' as const };
      const izq = imprimible(l.izq);
      if (izq.length + 1 + der.length <= columnas) {
        r.push({ ...base, texto: izq + ' '.repeat(columnas - izq.length - der.length) + der });
        continue;
      }
      const partes = cortar(izq, columnas);
      const ultima = partes.pop()!;
      for (const p of partes) r.push({ ...base, texto: p });
      if (ultima.length + 1 + der.length <= columnas)
        r.push({ ...base, texto: ultima + ' '.repeat(columnas - ultima.length - der.length) + der });
      else {
        r.push({ ...base, texto: ultima });
        r.push({ ...base, texto: der.padStart(columnas) });
      }
    }
  }
  return r;
}
