import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resumenTurno } from '@gula/shared';
import { Caja } from './Caja';
import { puenteFalso } from '../pruebas';
import type { EstadoCaja } from '../../compartido/caja';

const sinCaja: EstadoCaja & { porCobrar: [] } = { turno: null, resumen: null, movimientos: [], cobros: [], ultimoCierre: null, porCobrar: [] };
const turno = {
  id: 't1', abiertoPor: 'u1', abiertoEn: '2026-11-18T20:00:00.000Z', fondo: 1000000, cerradoPor: null, cerradoEn: null,
  contado: null, esperado: null, diferencia: null, notas: null,
};
const conCaja = {
  ...sinCaja,
  turno,
  resumen: resumenTurno({
    fondo: 1000000,
    pagos: [{ metodo: 'efectivo', monto: 500000, propina: 50000 }, { metodo: 'debito', monto: 700000, propina: 0 }],
    movimientos: [{ tipo: 'egreso', monto: 100000 }],
  }),
  movimientos: [
    { id: 'mv', turnoId: 't1', tipo: 'egreso' as const, categoria: 'proveedores' as const, monto: 100000, motivo: 'Hielo', usuarioId: 'u1', hechoEn: '2026-11-18T21:00:00.000Z' },
  ],
};

it('sin caja, "Abrir caja" manda el fondo en centavos', async () => {
  const p = puenteFalso({ 'caja:leer': () => sinCaja });
  render(<Caja />);
  await userEvent.type(await screen.findByLabelText('Fondo de cambio'), '10.000');
  await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:abrir', { fondo: 1000000 });
});

it('muestra el resumen por método y el efectivo esperado', async () => {
  puenteFalso({ 'caja:leer': () => conCaja });
  render(<Caja />);
  const resumen = await screen.findByRole('table', { name: 'Ventas por método' });
  expect(within(resumen).getByRole('row', { name: /Efectivo/ })).toHaveTextContent('$ 5.000');
  expect(within(resumen).getByRole('row', { name: /Débito/ })).toHaveTextContent('$ 7.000');
  expect(screen.getByText(/Efectivo esperado/).closest('p')).toHaveTextContent('$ 14.500');
  expect(screen.getByText('Hielo')).toBeInTheDocument();
});

it('cargar un egreso', async () => {
  const p = puenteFalso({ 'caja:leer': () => conCaja });
  render(<Caja />);
  const form = await screen.findByRole('group', { name: 'Nuevo movimiento' });
  await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'egreso');
  await userEvent.selectOptions(within(form).getByLabelText('Categoría'), 'sueldos');
  await userEvent.type(within(form).getByLabelText('Monto'), '2500');
  await userEvent.type(within(form).getByLabelText('Motivo'), 'Adelanto Juan');
  await userEvent.click(within(form).getByRole('button', { name: 'Registrar' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:movimiento', { tipo: 'egreso', categoria: 'sueldos', monto: 250000, motivo: 'Adelanto Juan' });
});

it('al cerrar muestra la diferencia antes de confirmar', async () => {
  const p = puenteFalso({ 'caja:leer': () => conCaja, 'caja:cerrar': () => ({ esperado: 1450000, diferencia: -50000 }) });
  render(<Caja />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cerrar caja' }));
  await userEvent.type(screen.getByLabelText('Efectivo contado'), '14.000');
  expect(screen.getByText('Faltan $ 500')).toBeInTheDocument();
  expect(p.invocar).not.toHaveBeenCalledWith('caja:cerrar', expect.anything());
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:cerrar', { contado: 1400000 });
});

it('un doble clic en "Registrar" registra un solo movimiento', async () => {
  let soltar = () => {};
  const p = puenteFalso({ 'caja:leer': () => conCaja, 'caja:movimiento': () => new Promise<void>((r) => (soltar = r)) });
  render(<Caja />);
  const form = await screen.findByRole('group', { name: 'Nuevo movimiento' });
  await userEvent.type(within(form).getByLabelText('Monto'), '100');
  await userEvent.type(within(form).getByLabelText('Motivo'), 'Hielo');
  const boton = within(form).getByRole('button', { name: 'Registrar' });
  await userEvent.click(boton);
  await userEvent.click(boton);
  soltar();
  expect(p.invocar.mock.calls.filter((c) => c[0] === 'caja:movimiento')).toHaveLength(1);
});

it('muestra lo que el servidor rechazó de la caja y se puede marcar como visto', async () => {
  const p = puenteFalso({
    'caja:leer': () => conCaja,
    'sync:rechazadas': () => [
      { id: 'op1', tipo: 'cuenta.cobrar', datos: { subtotal: 500000, descuento: null }, error: 'CAJA_CERRADA', creadaEn: '2026-11-18T21:00:00.000Z' },
      { id: 'op2', tipo: 'producto.disponibilidad', datos: {}, error: 'X', creadaEn: '2026-11-18T21:00:00.000Z' },
    ],
  });
  render(<Caja />);
  const bloque = await screen.findByRole('region', { name: 'Rechazado por el servidor' });
  expect(bloque).toHaveTextContent('Cobro de $ 5.000');
  expect(bloque).toHaveTextContent('la caja ya estaba cerrada');
  expect(bloque).not.toHaveTextContent('producto');
  await userEvent.click(within(bloque).getByRole('button', { name: 'Visto' }));
  expect(p.invocar).toHaveBeenCalledWith('sync:descartarRechazada', { id: 'op1' });
});
