import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Carta } from './Carta';
import { puenteFalso } from '../pruebas';
import type { CartaLocal } from '../../compartido/tipos';

const carta: CartaLocal = {
  sectores: [{ id: 's1', nombre: 'Cocina', orden: 0 }],
  categorias: [
    {
      id: 'c1', nombre: 'Pizzas', orden: 0, visible: true, horarioDesde: null, horarioHasta: null,
      productos: [
        { id: 'p1', categoriaId: 'c1', sectorId: 's1', nombre: 'Muzzarella', descripcion: null, precio: 1200000, foto: null, disponible: true, visible: true, orden: 0, etiquetas: [], grupos: [] },
      ],
    },
  ],
};
const moza = { id: 'u2', nombre: 'Ana', rol: 'mesero' as const };
const dueno = { id: 'u1', nombre: 'Ale', rol: 'dueno' as const };

it('la moza ve el switch de disponibilidad pero no los botones de edición', async () => {
  const p = puenteFalso({ 'carta:leer': () => carta });
  render(<Carta usuario={moza} conexion="en-linea" />);
  const sw = await screen.findByRole('switch', { name: 'Muzzarella disponible' });
  expect(screen.queryByRole('button', { name: 'Nuevo producto' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar Muzzarella' })).not.toBeInTheDocument();
  await userEvent.click(sw);
  expect(p.invocar).toHaveBeenCalledWith('carta:disponibilidad', { productoId: 'p1', disponible: false });
});

it('sin conexión se deshabilita editar pero no la disponibilidad', async () => {
  puenteFalso({ 'carta:leer': () => carta });
  render(<Carta usuario={dueno} conexion="sin-conexion" />);
  expect(await screen.findByRole('button', { name: 'Nuevo producto' })).toBeDisabled();
  expect(screen.getByText('Necesitás conexión para editar la carta.')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Muzzarella disponible' })).toBeEnabled();
});

it('crear producto convierte el precio a centavos', async () => {
  const p = puenteFalso({ 'carta:leer': () => carta });
  render(<Carta usuario={dueno} conexion="en-linea" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
  await userEvent.type(screen.getByLabelText('Nombre'), 'Fugazzeta');
  await userEvent.type(screen.getByLabelText('Precio ($)'), '13.500,50');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(p.invocar).toHaveBeenCalledWith('carta:editar', {
    tipo: 'crearProducto',
    datos: expect.objectContaining({ categoriaId: 'c1', nombre: 'Fugazzeta', precio: 1350050 }),
  });
});

it('precio inválido muestra el error y no guarda', async () => {
  const p = puenteFalso({ 'carta:leer': () => carta });
  render(<Carta usuario={dueno} conexion="en-linea" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nuevo producto' }));
  await userEvent.type(screen.getByLabelText('Nombre'), 'X');
  await userEvent.type(screen.getByLabelText('Precio ($)'), 'abc');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.getByText('Precio inválido')).toBeInTheDocument();
  expect(p.invocar).not.toHaveBeenCalledWith('carta:editar', expect.anything());
});
