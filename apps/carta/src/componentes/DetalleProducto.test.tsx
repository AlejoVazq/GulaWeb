import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetalleProducto } from './DetalleProducto';
import { cartaDePrueba } from '../fixtures';

const producto = cartaDePrueba.categorias[0]!.productos[0]!;

it('con grupo obligatorio sin elegir no deja agregar', () => {
  render(<DetalleProducto producto={producto} onAgregar={() => {}} onCerrar={() => {}} />);
  expect(screen.getByRole('button', { name: /Agregar/ })).toBeDisabled();
  expect(screen.getByText('Elegí una opción en "Tamaño"')).toBeInTheDocument();
});
it('al elegir Grande el precio se actualiza y agrega el ítem', async () => {
  const onAgregar = vi.fn();
  render(<DetalleProducto producto={producto} onAgregar={onAgregar} onCerrar={() => {}} />);
  await userEvent.click(screen.getByLabelText(/Grande/));
  const boton = screen.getByRole('button', { name: 'Agregar · $ 6.500' });
  expect(boton).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: '+' }));
  await userEvent.type(screen.getByLabelText('Nota para la cocina'), 'sin pepino');
  await userEvent.click(screen.getByRole('button', { name: 'Agregar · $ 13.000' }));
  expect(onAgregar).toHaveBeenCalledWith(
    expect.objectContaining({
      productoId: 'p1',
      cantidad: 2,
      nota: 'sin pepino',
      precioUnitario: 650000,
      seleccion: { tamano: ['grande'] },
      resumenOpciones: 'Grande',
    }),
  );
});
it('los checkboxes se bloquean al llegar al máximo', async () => {
  render(<DetalleProducto producto={producto} onAgregar={() => {}} onCerrar={() => {}} />);
  await userEvent.click(screen.getByLabelText(/Cheddar/));
  await userEvent.click(screen.getByLabelText(/Bacon/));
  expect(screen.getByLabelText(/Huevo/)).toBeDisabled();
});
