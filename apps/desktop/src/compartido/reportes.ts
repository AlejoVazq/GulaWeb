import { NOMBRE_METODO, NOMBRE_ORIGEN, formatearPrecio, variacion, type Rango, type Reporte } from '@gula/shared';

export type RespuestaReporte = { actual: Reporte; anterior: Reporte; rango: Rango; rangoAnterior: Rango };

/** "2026-11-01" → "01/11/2026". */
export const fechaCorta = (d: string) => d.split('-').reverse().join('/');
/** Variación para mostrar: "+12 %", "−5 %", "—" si no hay base. */
export function textoVariacion(actual: number, anterior: number): string {
  const v = variacion(actual, anterior);
  if (v === null) return '—';
  const p = Math.round(v * 100);
  return p > 0 ? `+${p} %` : p < 0 ? `−${-p} %` : '0 %';
}

type Fila = { nombre: string; clave: keyof Reporte; dinero: boolean };
const RESUMEN: Fila[] = [
  { nombre: 'Ventas', clave: 'ventas', dinero: true },
  { nombre: 'Cobros', clave: 'cobros', dinero: false },
  { nombre: 'Ticket promedio', clave: 'ticketPromedio', dinero: true },
  { nombre: 'Propinas', clave: 'propinas', dinero: true },
  { nombre: 'Descuentos', clave: 'descuentos', dinero: true },
  { nombre: 'Envíos', clave: 'envios', dinero: true },
  { nombre: 'Ingresos de caja', clave: 'ingresos', dinero: true },
  { nombre: 'Egresos', clave: 'egresos', dinero: true },
  { nombre: 'Resultado', clave: 'resultado', dinero: true },
];
/** Las filas del resumen que vienen en la respuesta (el encargado no recibe egresos ni resultado). */
export const filasResumen = (r: Reporte) => RESUMEN.filter((f) => typeof r[f.clave] === 'number');

// ---- CSV ----
const pesos = (c: number) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
const celda = (v: string | number) => {
  const t = String(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const linea = (...v: (string | number)[]) => v.map(celda).join(';');
const varCsv = (a: number, b: number) => {
  const v = variacion(a, b);
  return v === null ? '' : `${Math.round(v * 100)} %`;
};

/** CSV para Excel en español: BOM, `;` y coma decimal; montos sin símbolo. */
export function reporteACsv(r: RespuestaReporte, local: string): string {
  const { actual: a, anterior: b } = r;
  const l: string[] = [
    linea(`Reporte ${local}`),
    linea('Período', `${fechaCorta(r.rango.desde)} al ${fechaCorta(r.rango.hasta)}`),
    linea('Período anterior', `${fechaCorta(r.rangoAnterior.desde)} al ${fechaCorta(r.rangoAnterior.hasta)}`),
    '',
    linea('Resumen', 'Actual', 'Anterior', 'Variación'),
    ...filasResumen(a).map((f) => {
      const x = a[f.clave] as number;
      const y = (b[f.clave] as number | undefined) ?? 0;
      return linea(f.nombre, f.dinero ? pesos(x) : x, f.dinero ? pesos(y) : y, varCsv(x, y));
    }),
    '',
    linea('Método de pago', 'Ventas', 'Propinas'),
    ...a.porMetodo.map((m) => linea(NOMBRE_METODO[m.metodo], pesos(m.monto), pesos(m.propinas))),
    '',
    linea('Origen', 'Ventas', 'Cobros'),
    ...a.porOrigen.map((o) => linea(NOMBRE_ORIGEN[o.origen], pesos(o.ventas), o.cobros)),
    '',
    linea('Hora', 'Ventas', 'Cobros'),
    ...a.porHora.map((h) => linea(`${String(h.hora).padStart(2, '0')}:00`, pesos(h.ventas), h.cobros)),
    '',
    linea('Producto', 'Cantidad', 'Importe'),
    ...a.productos.map((p) => linea(p.nombre, p.cantidad, pesos(p.importe))),
    '',
    linea('Mesero', 'Pedidos', 'Importe'),
    ...a.meseros.map((m) => linea(m.nombre, m.pedidos, pesos(m.importe))),
  ];
  return `\uFEFF${l.join('\r\n')}\r\n`;
}

// ---- HTML (para el PDF) ----
const esc = (t: string | number) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const tabla = (titulo: string, cabeza: string[], filas: (string | number)[][]) =>
  filas.length
    ? `<h2>${esc(titulo)}</h2><table><thead><tr>${cabeza.map((c, i) => `<th${i ? ' class="n"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas
        .map((f) => `<tr>${f.map((c, i) => `<td${i ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '';

/** Documento A4 imprimible, autocontenido y sin scripts. */
export function reporteAHtml(r: RespuestaReporte, local: string): string {
  const { actual: a, anterior: b } = r;
  const valor = (f: Fila, x: number) => (f.dinero ? formatearPrecio(x) : String(x));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${esc(local)}</title><style>
body{font-family:system-ui,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}
p{margin:0 0 4px;color:#444}table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f3f3f3}.n{text-align:right}
</style></head><body>
<h1>Reporte · ${esc(local)}</h1>
<p>${esc(`${fechaCorta(r.rango.desde)} al ${fechaCorta(r.rango.hasta)}`)} · comparado con ${esc(
    `${fechaCorta(r.rangoAnterior.desde)} al ${fechaCorta(r.rangoAnterior.hasta)}`,
  )}</p>
${tabla(
  'Resumen',
  ['', 'Actual', 'Anterior', 'Variación'],
  filasResumen(a).map((f) => {
    const x = a[f.clave] as number;
    const y = (b[f.clave] as number | undefined) ?? 0;
    return [f.nombre, valor(f, x), valor(f, y), textoVariacion(x, y)];
  }),
)}
${tabla('Por método de pago', ['Método', 'Ventas', 'Propinas'], a.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], formatearPrecio(m.monto), formatearPrecio(m.propinas)]))}
${tabla('Por origen', ['Origen', 'Ventas', 'Cobros'], a.porOrigen.map((o) => [NOMBRE_ORIGEN[o.origen], formatearPrecio(o.ventas), o.cobros]))}
${tabla('Por hora', ['Hora', 'Ventas', 'Cobros'], a.porHora.map((h) => [`${String(h.hora).padStart(2, '0')}:00`, formatearPrecio(h.ventas), h.cobros]))}
${tabla('Productos más vendidos', ['Producto', 'Cantidad', 'Importe'], a.productos.map((p) => [p.nombre, p.cantidad, formatearPrecio(p.importe)]))}
${tabla('Ventas por mesero', ['Mesero', 'Pedidos', 'Importe'], a.meseros.map((m) => [m.nombre, m.pedidos, formatearPrecio(m.importe)]))}
<p style="margin-top:16px">Documento interno · no válido como factura</p>
</body></html>`;
}
