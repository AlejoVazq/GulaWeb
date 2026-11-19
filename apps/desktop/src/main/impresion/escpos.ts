import { CP850, imprimible, maquetar, type Documento } from '../../compartido/impresion';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Texto → bytes CP850 (lo que no existe en la página de códigos ya llega como `?`). */
export function aCp850(texto: string): Uint8Array {
  const limpio = imprimible(texto);
  const bytes: number[] = [];
  for (const c of limpio) bytes.push(CP850[c] ?? c.charCodeAt(0));
  return Uint8Array.from(bytes);
}

const ALINEAR = { izq: 0, centro: 1, der: 2 } as const;
const TAM = { normal: 0x00, alto: 0x01, doble: 0x11 } as const;

/** Un documento listo para la impresora: inicializa, imprime cada renglón con su estilo y corta. */
export function aEscPos(doc: Documento, columnas: number): Uint8Array {
  const b: number[] = [ESC, 0x40, ESC, 0x74, 0x02];
  for (const r of maquetar(doc, columnas)) {
    b.push(ESC, 0x61, ALINEAR[r.alinear], ESC, 0x45, r.negrita ? 1 : 0, GS, 0x21, TAM[r.tam]);
    b.push(...aCp850(r.texto), LF);
  }
  b.push(ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0, LF, LF, LF, LF, GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(b);
}
