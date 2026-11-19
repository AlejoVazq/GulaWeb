import { expect, it } from 'vitest';
import { hojaQrAHtml, urlCartaMesa } from '../src/compartido/qr';

it('arma la URL pública de la carta a partir del servidor del API', () => {
  expect(urlCartaMesa('https://gula.com.ar/api/', 'la-gula', 'TOK')).toBe('https://gula.com.ar/la-gula/m/TOK');
  expect(urlCartaMesa('http://localhost:3000', 'la-gula', 'a b')).toBe('http://localhost:3000/la-gula/m/a%20b');
});

it('una tarjeta por mesa, con el texto escapado', () => {
  const html = hojaQrAHtml(
    'Bar <Gula>',
    [
      { nombre: 'Mesa 1', zona: 'Salón', url: 'https://x/l/m/1' },
      { nombre: 'Mesa 2', zona: null, url: 'https://x/l/m/2' },
    ],
    ['<svg id="a"></svg>', '<svg id="b"></svg>'],
  );
  expect(html.match(/class="tarjeta"/g)).toHaveLength(2);
  expect(html).toContain('Bar &lt;Gula&gt;');
  expect(html).toContain('<svg id="b"></svg>');
  expect(html).toContain('Salón');
});
