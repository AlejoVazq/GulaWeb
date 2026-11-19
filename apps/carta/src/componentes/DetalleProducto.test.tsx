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
  const boton = screen.getByRole('button', { name: 'Agregar a la comanda · $ 6.500' });
  expect(boton).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Sumar uno' }));
  await userEvent.type(screen.getByLabelText('Nota para la cocina'), 'sin pepino');
  await userEvent.click(screen.getByRole('button', { name: 'Agregar a la comanda · $ 13.000' }));
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

it('al abrir enfoca el panel, Escape cierra y Tab no se escapa', async () => {
  const onCerrar = vi.fn();
  render(
    <>
      <button type="button">fondo</button>
      <DetalleProducto producto={producto} onAgregar={() => {}} onCerrar={onCerrar} />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
  await userEvent.tab({ shift: true });
  expect(screen.getByRole('button', { name: 'fondo' })).not.toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(onCerrar).toHaveBeenCalled();
});

it('el botón dice "Agregar a la comanda" con el total que incluye recargos y cantidad', async () => {
  render(<DetalleProducto producto={producto} onAgregar={vi.fn()} onCerrar={vi.fn()} />);
  await userEvent.click(screen.getByLabelText(/Grande/));
  await userEvent.click(screen.getByLabelText(/Cheddar/));
  await userEvent.click(screen.getByRole('button', { name: 'Sumar uno' }));
  expect(screen.getByRole('button', { name: 'Agregar a la comanda · $ 14.600' })).toBeEnabled();
});

it('una nota de 140 caracteres se acepta y se ve completa', async () => {
  const agregar = vi.fn();
  render(<DetalleProducto producto={producto} onAgregar={agregar} onCerrar={vi.fn()} />);
  const nota = 'sin cebolla, '.repeat(11).slice(0, 140);
  await userEvent.click(screen.getByLabelText(/Simple/));
  await userEvent.type(screen.getByLabelText('Nota para la cocina'), nota);
  expect(screen.getByLabelText('Nota para la cocina')).toHaveValue(nota);
  await userEvent.click(screen.getByRole('button', { name: /^Agregar a la comanda/ }));
  expect(agregar).toHaveBeenCalledWith(expect.objectContaining({ nota: nota.trim() }));
});
