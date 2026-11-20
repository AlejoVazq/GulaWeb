import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Reporte } from '@gula/shared';
import { Reportes } from './Reportes';
import { puenteFalso } from '../pruebas';
import type { RespuestaReporte } from '../../compartido/reportes';

const vacio: Reporte = { ventas: 0, cobros: 0, ticketPromedio: 0, propinas: 0, descuentos: 0, envios: 0, porMetodo: [], porOrigen: [], porHora: [], productos: [], meseros: [] };
const resp = (actual: Partial<Reporte>, anterior: Partial<Reporte> = {}): RespuestaReporte => ({
  rango: { desde: '2026-11-01', hasta: '2026-11-30' },
  rangoAnterior: { desde: '2026-10-01', hasta: '2026-10-31' },
  actual: { ...vacio, ...actual },
  anterior: { ...vacio, ...anterior },
});
const completo = resp(
  {
    ventas: 1500000, cobros: 2, ticketPromedio: 750000, egresos: 200000, ingresos: 0, resultado: 1300000,
    porOrigen: [{ origen: 'delivery', ventas: 950000, cobros: 1 }],
    productos: [{ productoId: 'p', nombre: 'Pizza', cantidad: 3, importe: 900000 }],
    meseros: [{ usuarioId: 'u', nombre: 'Ana', pedidos: 2, importe: 1500000 }],
  },
  { ventas: 1000000, cobros: 0, egresos: 0, ingresos: 0, resultado: 1000000 },
);

it('al abrir pide el mes actual y muestra las tarjetas con su variación', async () => {
  const p = puenteFalso({ 'reportes:obtener': () => completo });
  render(<Reportes hoy="2026-11-19" />);
  const ventas = await screen.findByRole('group', { name: 'Ventas' });
  expect(p.invocar).toHaveBeenCalledWith('reportes:obtener', { tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' });
  expect(ventas).toHaveTextContent('$ 15.000');
  expect(ventas).toHaveTextContent('+50 %');
  expect(screen.getByRole('group', { name: 'Cobros' })).toHaveTextContent('—');
  expect(screen.getByRole('group', { name: 'Resultado' })).toHaveTextContent('$ 13.000');
  expect(within(screen.getByRole('table', { name: 'Por origen' })).getByText('Delivery')).toBeInTheDocument();
  expect(within(screen.getByRole('table', { name: 'Productos más vendidos' })).getByText('Pizza')).toBeInTheDocument();
});

it('sin resultado en la respuesta (encargado) no hay tarjeta de resultado', async () => {
  puenteFalso({ 'reportes:obtener': () => resp({ ventas: 100 }) });
  render(<Reportes hoy="2026-11-19" />);
  await screen.findByRole('group', { name: 'Ventas' });
  expect(screen.queryByRole('group', { name: 'Resultado' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Egresos' })).toBeNull();
});

it('"Anterior" pide el mes anterior y cambiar a semana pide la semana', async () => {
  const p = puenteFalso({ 'reportes:obtener': () => completo });
  render(<Reportes hoy="2026-11-19" />);
  await screen.findByRole('group', { name: 'Ventas' });
  await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  expect(p.invocar).toHaveBeenLastCalledWith('reportes:obtener', { tipo: 'mes', desde: '2026-10-01', hasta: '2026-10-31' });
  await userEvent.selectOptions(screen.getByLabelText('Período'), 'semana');
  expect(p.invocar).toHaveBeenLastCalledWith('reportes:obtener', { tipo: 'semana', desde: '2026-11-16', hasta: '2026-11-22' });
});

it('exporta a CSV con lo que está en pantalla', async () => {
  const p = puenteFalso({ 'reportes:obtener': () => completo, 'reportes:exportar': () => true });
  render(<Reportes hoy="2026-11-19" />);
  await screen.findByRole('group', { name: 'Ventas' });
  await userEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
  expect(p.invocar).toHaveBeenCalledWith('reportes:exportar', { formato: 'csv', reporte: completo });
  expect(await screen.findByText('Reporte guardado.')).toBeInTheDocument();
});

it('sin conexión muestra el aviso', async () => {
  puenteFalso({
    'reportes:obtener': () => {
      throw { codigo: 'SIN_CONEXION', mensaje: 'Los reportes necesitan conexión.' };
    },
  });
  render(<Reportes hoy="2026-11-19" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Los reportes necesitan conexión.');
});
