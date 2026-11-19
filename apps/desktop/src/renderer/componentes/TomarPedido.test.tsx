import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TomarPedido } from './TomarPedido';
import { puenteFalso } from '../pruebas';
import { cartaSalon } from '../fixturasSalon';


it('un producto con un grupo obligatorio sin elegir no habilita "Agregar"', async () => {
  puenteFalso({ 'carta:leer': () => cartaSalon });
  render(<TomarPedido titulo="Mesa 1" onEnviar={vi.fn()} onCancelar={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /Clásica/ }));
  const d = screen.getByRole('dialog', { name: 'Clásica' });
  expect(within(d).getByRole('button', { name: /Agregar/ })).toBeDisabled();
  await userEvent.click(within(d).getByLabelText(/Doble/));
  expect(within(d).getByRole('button', { name: /Agregar/ })).toBeEnabled();
});

it('arma el pedido con opciones, nota y cantidad, y "Enviar a cocina" lo manda', async () => {
  puenteFalso({ 'carta:leer': () => cartaSalon });
  const onEnviar = vi.fn(async () => {});
  render(<TomarPedido titulo="Mesa 1" onEnviar={onEnviar} onCancelar={vi.fn()} />);
  expect(await screen.findByRole('button', { name: 'Enviar a cocina' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: /Clásica/ }));
  const d = screen.getByRole('dialog', { name: 'Clásica' });
  await userEvent.click(within(d).getByLabelText(/Doble/));
  await userEvent.type(within(d).getByLabelText('Nota'), 'sin cebolla');
  await userEvent.click(within(d).getByRole('button', { name: 'Sumar uno' }));
  await userEvent.click(within(d).getByRole('button', { name: /Agregar/ }));

  const resumen = screen.getByRole('region', { name: 'Pedido' });
  expect(within(resumen).getByText('2× Clásica')).toBeInTheDocument();
  expect(within(resumen).getByText('Doble · sin cebolla')).toBeInTheDocument();
  expect(within(resumen).getByText(/Total/)).toHaveTextContent('14.000');

  await userEvent.click(screen.getByRole('button', { name: 'Enviar a cocina' }));
  expect(onEnviar).toHaveBeenCalledWith([{ productoId: 'p1', seleccion: { g1: ['o2'] }, nota: 'sin cebolla', cantidad: 2 }]);
});

it('los productos sin stock no se pueden elegir y el buscador filtra', async () => {
  puenteFalso({ 'carta:leer': () => cartaSalon });
  render(<TomarPedido titulo="Mesa 1" onEnviar={vi.fn()} onCancelar={vi.fn()} />);
  expect(await screen.findByRole('button', { name: /Agua/ })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Buscar producto'), 'gase');
  expect(screen.getByRole('button', { name: /Gaseosa/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Clásica/ })).not.toBeInTheDocument();
});
