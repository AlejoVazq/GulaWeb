import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NuevoDelivery } from './NuevoDelivery';
import { puenteFalso } from '../pruebas';
import { cartaSalon } from '../fixturasSalon';

it('un teléfono conocido completa los datos y el pedido se crea con el envío y el paga con', async () => {
  const p = puenteFalso({
    'delivery:cliente': () => ({ nombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: 'Timbre B' }),
    'carta:leer': () => cartaSalon,
    'delivery:crear': () => ({ pedidoId: 'd1', numero: 7 }),
  });
  const onCreado = vi.fn();
  render(<NuevoDelivery envioPorDefecto={150000} onCancelar={() => {}} onCreado={onCreado} />);
  await userEvent.type(screen.getByLabelText('Teléfono'), '1155551234');
  await userEvent.tab();
  expect(await screen.findByDisplayValue('Av. Siempreviva 742')).toBeInTheDocument();
  expect(screen.getByLabelText('Nombre')).toHaveValue('Juana');
  expect(screen.getByLabelText('Envío')).toHaveValue('1500');
  await userEvent.type(screen.getByLabelText('Paga con (opcional)'), '20.000');
  await userEvent.click(screen.getByRole('button', { name: 'Elegir productos' }));
  await userEvent.click(await screen.findByRole('button', { name: /Gaseosa/ }));
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Gaseosa' })).getByRole('button', { name: /Agregar/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Enviar a cocina' }));
  expect(p.invocar).toHaveBeenCalledWith('delivery:crear', {
    cliente: { nombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: 'Timbre B' },
    costoEnvio: 150000,
    pagaCon: 2000000,
    notas: '',
    items: [{ productoId: 'p3', seleccion: {}, nota: '', cantidad: 1 }],
  });
  expect(onCreado).toHaveBeenCalledWith(7);
});

it('sin nombre o dirección no se puede seguir', async () => {
  puenteFalso({ 'delivery:cliente': () => null });
  render(<NuevoDelivery envioPorDefecto={0} onCancelar={() => {}} onCreado={() => {}} />);
  await userEvent.type(screen.getByLabelText('Nombre'), 'Pedro');
  expect(screen.getByRole('button', { name: 'Elegir productos' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Dirección'), 'Calle 1');
  expect(screen.getByRole('button', { name: 'Elegir productos' })).toBeEnabled();
});
