import { expect, it } from 'vitest';
import type { Reporte } from '@gula/shared';
import { reporteACsv, reporteAHtml, type RespuestaReporte } from '../src/compartido/reportes';

const vacio: Reporte = {
  ventas: 0, cobros: 0, ticketPromedio: 0, propinas: 0, descuentos: 0, envios: 0,
  porMetodo: [], porOrigen: [], porHora: [], productos: [], meseros: [],
};
const respuesta = (actual: Partial<Reporte>, anterior: Partial<Reporte> = {}): RespuestaReporte => ({
  rango: { desde: '2026-11-01', hasta: '2026-11-30' },
  rangoAnterior: { desde: '2026-10-01', hasta: '2026-10-31' },
  actual: { ...vacio, ...actual },
  anterior: { ...vacio, ...anterior },
});
const r = respuesta(
  {
    ventas: 1500000, cobros: 2, ticketPromedio: 750000, egresos: 200000, ingresos: 0, resultado: 1300000,
    porMetodo: [{ metodo: 'efectivo', monto: 1500000, propinas: 0 }],
    productos: [{ productoId: 'p', nombre: 'Pizza "especial"; grande', cantidad: 2, importe: 1500000 }],
  },
  { ventas: 1000000, cobros: 1, egresos: 0, ingresos: 0, resultado: 1000000 },
);

it('el CSV abre bien en Excel: BOM, punto y coma, coma decimal', () => {
  const csv = reporteACsv(r, 'Bar Gula');
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('Ventas;15000,00;10000,00;50 %');
  expect(csv).toContain('Resultado;13000,00;10000,00;30 %');
  expect(csv).toContain('Efectivo;15000,00;0,00');
  expect(csv).toContain('"Pizza ""especial""; grande";2;15000,00');
});

it('sin resultado (encargado) no hay fila de resultado ni egresos; variación vacía sin base', () => {
  const csv = reporteACsv(respuesta({ ventas: 500 }), 'Bar Gula');
  expect(csv).not.toContain('Resultado');
  expect(csv).not.toContain('Egresos');
  expect(csv).toContain('Ventas;5,00;0,00;\r\n');
});

it('el HTML escapa los textos y no lleva scripts', () => {
  const html = reporteAHtml(respuesta({ productos: [{ productoId: 'p', nombre: '<script>alert(1)</script>', cantidad: 1, importe: 100 }] }), 'Bar <Gula>');
  expect(html).not.toContain('<script');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('Bar &lt;Gula&gt;');
  expect(html).toContain('01/11/2026 al 30/11/2026');
});
