import { describe, expect, it } from 'vitest';
import { maquetar, type Documento } from '../src/compartido/impresion';
import { aCp850, aEscPos } from '../src/main/impresion/escpos';

const doc = (lineas: Documento['lineas']): Documento => ({ titulo: 't', lineas });

describe('maquetar', () => {
  it('corta un texto largo entre palabras', () => {
    const texto = 'Hamburguesa doble con cheddar bacon y huevo frito a caballo';
    expect(texto.length).toBeGreaterThan(48);
    const r = maquetar(doc([{ tipo: 'texto', texto }]), 48);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.texto.length <= 48)).toBe(true);
    expect(r.map((x) => x.texto).join(' ')).toBe(texto);
  });

  it('el texto doble ocupa la mitad de columnas', () => {
    const r = maquetar(doc([{ tipo: 'texto', texto: 'COCINA COCINA COCINA COCINA', tam: 'doble' }]), 48);
    expect(r.every((x) => x.texto.length <= 24)).toBe(true);
    expect(r[0]!.tam).toBe('doble');
  });

  it('parte una palabra más larga que el ancho', () => {
    const r = maquetar(doc([{ tipo: 'texto', texto: 'x'.repeat(50) }]), 48);
    expect(r.map((x) => x.texto)).toEqual(['x'.repeat(48), 'xx']);
  });

  it('un par justifica el monto a la derecha', () => {
    const [r] = maquetar(doc([{ tipo: 'par', izq: 'Total', der: '$ 1.500' }]), 48);
    expect(r!.texto).toHaveLength(48);
    expect(r!.texto.startsWith('Total')).toBe(true);
    expect(r!.texto.endsWith('$ 1.500')).toBe(true);
  });

  it('un par que no entra corta la izquierda y deja el monto en el último renglón', () => {
    const izq = '3x Milanesa napolitana con papas fritas y ensalada';
    const r = maquetar(doc([{ tipo: 'par', izq, der: '$ 45.000' }]), 32);
    expect(r.length).toBeGreaterThan(1);
    expect(r.at(-1)!.texto.endsWith('$ 45.000')).toBe(true);
    expect(r.every((x) => x.texto.length <= 32)).toBe(true);
    expect(r.map((x) => x.texto.replace('$ 45.000', '').trim()).join(' ')).toBe(izq);
  });

  it('separador y espacio', () => {
    const r = maquetar(doc([{ tipo: 'separador' }, { tipo: 'espacio' }]), 32);
    expect(r.map((x) => x.texto)).toEqual(['-'.repeat(32), '']);
  });

  it('reemplaza lo que la impresora no puede mostrar', () => {
    const [r] = maquetar(doc([{ tipo: 'texto', texto: 'pizza 🍕 “rica” — ñandú' }]), 48);
    expect(r!.texto).toBe('pizza ? "rica" - ñandú');
  });
});

describe('ESC/POS', () => {
  it('codifica en CP850', () => {
    expect([...aCp850('ñÑáé¿¡')]).toEqual([0xa4, 0xa5, 0xa0, 0x82, 0xa8, 0xad]);
  });

  it('un emoji es un solo signo de pregunta', () => {
    const b = aCp850('pizza 🍕');
    expect([...b]).toEqual([...Buffer.from('pizza ?', 'ascii')]);
  });

  it('inicializa, elige CP850 y termina cortando', () => {
    const b = [...aEscPos(doc([{ tipo: 'texto', texto: 'Hola', tam: 'doble', negrita: true, alinear: 'centro' }]), 48)];
    expect(b.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
    expect(b.slice(-4)).toEqual([0x1d, 0x56, 0x42, 0x00]);
    const hex = Buffer.from(b).toString('hex');
    expect(hex).toContain('1b6101'); // centrado
    expect(hex).toContain('1b4501'); // negrita
    expect(hex).toContain('1d2111'); // doble
    expect(hex).toContain(Buffer.from('Hola\n').toString('hex'));
  });
});
