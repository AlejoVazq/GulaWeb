import { describe, expect, it } from 'vitest';
import { leerMarca, validarCampoMarca } from './marca.js';

describe('leerMarca', () => {
  it('marca vacía → tema comanda-bn, modo auto, sin logo ni lema', () => {
    expect(leerMarca({})).toEqual({ tema: 'comanda-bn', modo: 'auto' });
  });

  it('toma tema, modo, logo y lema válidos', () => {
    expect(leerMarca({ tema: 'comanda-bn', modo: 'oscuro', logo: '/marcas/gula-hoja.svg', lema: '  est. 2024 ' })).toEqual({
      tema: 'comanda-bn',
      modo: 'oscuro',
      logo: '/marcas/gula-hoja.svg',
      lema: 'est. 2024',
    });
  });

  it('descarta tema desconocido, modo inválido, logo peligroso y lema de 41 caracteres', () => {
    expect(leerMarca({ tema: 'neon', modo: 'sepia', logo: 'javascript:alert(1)', lema: 'x'.repeat(41) })).toEqual({ tema: 'comanda-bn', modo: 'auto' });
    expect(leerMarca({ logo: 'http://x.com/a.png' })).toEqual({ tema: 'comanda-bn', modo: 'auto' });
  });

  it('conserva colorAcento válido (compatibilidad) y descarta el inválido', () => {
    expect(leerMarca({ colorAcento: '#1A7f3c' }).colorAcento).toBe('#1A7f3c');
    expect(leerMarca({ colorAcento: 'red;background:url(x)' }).colorAcento).toBeUndefined();
  });

  it('no lanza con null, string, número o array', () => {
    for (const v of [null, undefined, 'x', 3, []]) expect(leerMarca(v)).toEqual({ tema: 'comanda-bn', modo: 'auto' });
  });
});

describe('validarCampoMarca', () => {
  it('null para valores válidos', () => {
    expect(validarCampoMarca('tema', 'comanda-bn')).toBeNull();
    expect(validarCampoMarca('modo', 'claro')).toBeNull();
    expect(validarCampoMarca('logo', 'https://cdn.x.com/l.svg')).toBeNull();
    expect(validarCampoMarca('lema', 'est. 2024')).toBeNull();
    expect(validarCampoMarca('color', '#111111')).toBeNull();
  });

  it('mensaje para valores inválidos', () => {
    expect(validarCampoMarca('tema', 'neon')).toMatch(/tema/i);
    expect(validarCampoMarca('modo', 'sepia')).toMatch(/modo/i);
    expect(validarCampoMarca('logo', 'http://x.com/a.png')).toMatch(/logo/i);
    expect(validarCampoMarca('lema', '   ')).toMatch(/lema/i);
    expect(validarCampoMarca('color', 'rojo')).toMatch(/color/i);
  });
});
