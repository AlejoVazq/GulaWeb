import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Carta } from './Carta';
import { cartaDePrueba } from '../fixtures';

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } }));
}

function montar(url = '/la-gula') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/:slug" element={<Carta />} />
        <Route path="/:slug/m/:token" element={<Carta />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => respuesta(200, cartaDePrueba)));
});
afterEach(() => vi.unstubAllGlobals());

it('muestra el local, las categorías y los precios', async () => {
  montar();
  expect(await screen.findByRole('heading', { name: 'Bar La Gula' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Hamburguesas' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Hamburguesa clásica/ })).toHaveTextContent('$ 5.000');
  expect(fetch).toHaveBeenCalledWith('/api/publico/locales/la-gula/carta', expect.anything());
});
it('producto sin stock aparece deshabilitado', async () => {
  montar();
  const papas = await screen.findByRole('button', { name: /Papas con cheddar/ });
  expect(papas).toBeDisabled();
  expect(papas).toHaveTextContent('Sin stock');
});
it('categoría fuera de horario avisa y no deja elegir', async () => {
  montar();
  expect(await screen.findByText('Disponible de 08:00 a 12:00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Café con leche/ })).toBeDisabled();
});
it('slug inexistente muestra "No encontramos este local"', async () => {
  vi.stubGlobal('fetch', vi.fn(() => respuesta(404, { error: { codigo: 'LOCAL_NO_ENCONTRADO', mensaje: 'x' } })));
  montar('/nada');
  expect(await screen.findByText('No encontramos este local')).toBeInTheDocument();
});

it('agregar un producto muestra la barra del pedido y el envío queda deshabilitado', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  montar();
  await userEvent.click(await screen.findByRole('button', { name: /Hamburguesa clásica/ }));
  await userEvent.click(screen.getByLabelText(/Grande/));
  await userEvent.click(screen.getByRole('button', { name: 'Agregar · $ 6.500' }));
  const barra = screen.getByRole('button', { name: 'Ver pedido (1) · $ 6.500' });
  await userEvent.click(barra);
  expect(screen.getByText('Grande')).toBeInTheDocument();
  const enviar = screen.getByRole('button', { name: 'Pedí al mozo que habilite la mesa' });
  expect(enviar).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Quitar Hamburguesa clásica' }));
  expect(screen.queryByRole('button', { name: /Ver pedido/ })).not.toBeInTheDocument();
});
