import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Cobrar } from './Cobrar';
import { puenteFalso } from '../pruebas';

it('dividir en efectivo y débito habilita Cobrar y manda los dos pagos', async () => {
  const p = puenteFalso({ 'caja:cobrar': () => ({ cobroId: 'c', total: 2000000 }) });
  const onListo = vi.fn();
  render(<Cobrar titulo="Mesa 3" subtotal={2000000} destino={{ sesionId: 's1' }} onListo={onListo} onCancelar={vi.fn()} />);
  const monto1 = screen.getByLabelText('Monto pago 1');
  expect(monto1).toHaveValue('20000');
  await userEvent.clear(monto1);
  await userEvent.type(monto1, '12000');
  expect(screen.getByText('Falta $ 8.000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cobrar' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Dividir' }));
  expect(screen.getByLabelText('Monto pago 2')).toHaveValue('8000');
  await userEvent.selectOptions(screen.getByLabelText('Método pago 2'), 'debito');
  await userEvent.click(screen.getByRole('button', { name: 'Cobrar' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:cobrar', {
    destino: { sesionId: 's1' },
    descuento: null,
    pagos: [
      { metodo: 'efectivo', monto: 1200000, propina: 0 },
      { metodo: 'debito', monto: 800000, propina: 0 },
    ],
  });
  expect(onListo).toHaveBeenCalled();
});

it('con efectivo recibido muestra el vuelto', async () => {
  puenteFalso({});
  render(<Cobrar titulo="Mesa 3" subtotal={1200000} destino={{ sesionId: 's1' }} onListo={vi.fn()} onCancelar={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Recibido en efectivo'), '15000');
  expect(screen.getByText('Vuelto $ 3.000')).toBeInTheDocument();
});

it('un descuento del 10 % baja el total y pide motivo', async () => {
  const p = puenteFalso({ 'caja:cobrar': () => ({ cobroId: 'c', total: 900000 }) });
  render(<Cobrar titulo="Mesa 3" subtotal={1000000} destino={{ sesionId: 's1' }} onListo={vi.fn()} onCancelar={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText('Tipo de descuento'), 'porcentaje');
  await userEvent.type(screen.getByLabelText('Descuento'), '10');
  expect(screen.getByText(/Total a cobrar/)).toHaveTextContent('$ 9.000');
  expect(screen.getByLabelText('Monto pago 1')).toHaveValue('9000');
  expect(screen.getByRole('button', { name: 'Cobrar' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Motivo del descuento'), 'Habitué');
  await userEvent.click(screen.getByRole('button', { name: 'Cobrar' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:cobrar', expect.objectContaining({ descuento: { tipo: 'porcentaje', valor: 10, motivo: 'Habitué' } }));
});

it('si la caja está cerrada muestra el aviso', async () => {
  puenteFalso({ 'caja:cobrar': () => Promise.reject({ codigo: 'CAJA_CERRADA', mensaje: 'Abrí la caja para cobrar.' }) });
  render(<Cobrar titulo="Mesa 3" subtotal={500000} destino={{ sesionId: 's1' }} onListo={vi.fn()} onCancelar={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Cobrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Abrí la caja para cobrar.');
});
