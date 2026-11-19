import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductoPublico } from '@gula/shared';
import { ProductoCard } from './ProductoCard';
import { cartaDePrueba } from '../fixtures';

const [conOpciones, sinStock] = cartaDePrueba.categorias[0]!.productos as [ProductoPublico, ProductoPublico];
const simple: ProductoPublico = { ...sinStock, id: 'p9', nombre: 'Fernet Branca', disponible: true };

it('sin opciones: el + agrega directo y muestra la cantidad que va en la comanda', async () => {
  const agregar = vi.fn();
  const { rerender } = render(
    <ProductoCard producto={simple} habilitado cantidadEnComanda={0} onElegir={vi.fn()} onAgregarRapido={agregar} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Agregar Fernet Branca' }));
  expect(agregar).toHaveBeenCalledWith(simple);
  rerender(<ProductoCard producto={simple} habilitado cantidadEnComanda={2} onElegir={vi.fn()} onAgregarRapido={agregar} />);
  const boton = screen.getByRole('button', { name: 'Agregar otro Fernet Branca, van 2' });
  expect(boton).toHaveTextContent('2');
  expect(boton).toHaveClass('producto__mas--lleno');
});

it('con opciones: el + abre el detalle y no agrega', async () => {
  const elegir = vi.fn();
  const agregar = vi.fn();
  render(<ProductoCard producto={conOpciones} habilitado cantidadEnComanda={0} onElegir={elegir} onAgregarRapido={agregar} />);
  await userEvent.click(screen.getByRole('button', { name: 'Agregar Hamburguesa clásica' }));
  expect(elegir).toHaveBeenCalledWith(conOpciones);
  expect(agregar).not.toHaveBeenCalled();
});

it('sin stock: tachado, botón deshabilitado y "Sin stock por hoy" en lugar de la descripción', () => {
  render(<ProductoCard producto={sinStock} habilitado cantidadEnComanda={0} onElegir={vi.fn()} onAgregarRapido={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Sin stock: Papas con cheddar' })).toBeDisabled();
  expect(screen.getByText('Sin stock por hoy')).toBeInTheDocument();
  expect(screen.getByRole('article')).toHaveClass('producto--sin-stock');
});

it('nombre de 60 caracteres y descripción larga se muestran completos', () => {
  const largo = { ...simple, nombre: 'Gin Beefeater con agua tónica, pepino y pimienta rosa xx'.slice(0, 60), descripcion: 'x '.repeat(70) };
  render(<ProductoCard producto={largo} habilitado cantidadEnComanda={0} onElegir={vi.fn()} onAgregarRapido={vi.fn()} />);
  expect(screen.getByRole('heading', { name: largo.nombre })).toBeInTheDocument();
});
