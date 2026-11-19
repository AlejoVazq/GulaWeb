import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { MesaPublica } from '@gula/shared';
import { Carta } from './Carta';
import { cartaDePrueba } from '../fixtures';

const json = (status: number, c: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } }),
  );

const mesaAbierta: MesaPublica = {
  mesa: { nombre: 'Mesa 3' },
  local: { nombre: 'Bar La Gula', slug: 'la-gula' },
  aceptaPedidos: true,
  motivo: null,
};

type Llamada = { url: string; metodo: string; cuerpo: unknown };
let llamadas: Llamada[];
let fallarPost: number;

function servidor(mesa: MesaPublica) {
  llamadas = [];
  fallarPost = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? 'GET';
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
      llamadas.push({ url, metodo, cuerpo });
      if (url.endsWith('/carta')) return json(200, cartaDePrueba);
      if (url === '/api/publico/mesas/TOKEN' && metodo === 'GET') return json(200, mesa);
      if (url === '/api/publico/mesas/TOKEN/pedidos') {
        if (fallarPost > 0) {
          fallarPost--;
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        const c = cuerpo as { id: string };
        return json(201, {
          id: c.id,
          estado: 'pendiente',
          motivoRechazo: null,
          total: 650000,
          items: [],
        });
      }
      if (url === '/api/publico/mesas/TOKEN/avisos')
        return json(201, { id: 'a1', tipo: (cuerpo as { tipo: string }).tipo });
      if (url.startsWith('/api/publico/pedidos/'))
        return json(200, {
          id: 'x',
          estado: 'pendiente',
          motivoRechazo: null,
          total: 0,
          items: [],
        });
      return json(404, {});
    }),
  );
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/la-gula/m/TOKEN']}>
      <Routes>
        <Route path="/:slug/m/:token" element={<Carta />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function agregarHamburguesa() {
  await userEvent.click(await screen.findByRole('button', { name: /^Hamburguesa clásica/ }));
  await userEvent.click(screen.getByLabelText(/Grande/));
  await userEvent.click(screen.getByRole('button', { name: 'Agregar · $ 6.500' }));
  await userEvent.click(screen.getByRole('button', { name: /Ver pedido/ }));
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it('con la mesa abierta envía los ítems sin precios y muestra que espera confirmación', async () => {
  servidor(mesaAbierta);
  montar();
  expect(await screen.findByLabelText('Mesa 3')).toBeInTheDocument();
  await agregarHamburguesa();
  await userEvent.click(screen.getByRole('button', { name: 'Enviar pedido · $ 6.500' }));

  const post = llamadas.find((l) => l.metodo === 'POST' && l.url.endsWith('/pedidos'))!;
  expect(post.cuerpo).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    items: [{ productoId: 'p1', seleccion: { tamano: ['grande'] }, nota: '', cantidad: 1 }],
  });
  expect(JSON.stringify(post.cuerpo)).not.toMatch(/precio/i);
  expect(await screen.findByText('Enviado — esperando confirmación')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ver pedido/ })).not.toBeInTheDocument();
});

it('con la mesa cerrada el botón lo explica y está deshabilitado', async () => {
  servidor({ ...mesaAbierta, aceptaPedidos: false, motivo: 'mesa_cerrada' });
  montar();
  await agregarHamburguesa();
  expect(
    screen.getByRole('button', { name: 'Pedile a la moza que habilite la mesa' }),
  ).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Llamar a la moza' })).not.toBeInTheDocument();
});

it('si el local está sin conexión pide hacerlo con la moza', async () => {
  servidor({ ...mesaAbierta, aceptaPedidos: false, motivo: 'local_sin_conexion' });
  montar();
  await agregarHamburguesa();
  expect(screen.getByRole('button', { name: 'Hacé tu pedido a la moza' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Llamar a la moza' })).not.toBeInTheDocument();
});

it('un fallo de red reintenta con el mismo id', async () => {
  servidor(mesaAbierta);
  montar();
  await agregarHamburguesa();
  fallarPost = 1;
  await userEvent.click(screen.getByRole('button', { name: 'Enviar pedido · $ 6.500' }));
  expect(
    await screen.findByText('Enviado — esperando confirmación', {}, { timeout: 4000 }),
  ).toBeInTheDocument();
  const posts = llamadas.filter((l) => l.metodo === 'POST' && l.url.endsWith('/pedidos'));
  expect(posts).toHaveLength(2);
  expect((posts[0]!.cuerpo as { id: string }).id).toBe((posts[1]!.cuerpo as { id: string }).id);
});

it('"Llamar a la moza" avisa y se deshabilita un rato', async () => {
  servidor(mesaAbierta);
  montar();
  await userEvent.click(await screen.findByRole('button', { name: 'Llamar a la moza' }));
  expect(llamadas.find((l) => l.url.endsWith('/avisos'))!.cuerpo).toEqual({ tipo: 'llamar' });
  const zona = screen.getByRole('group', { name: 'Avisos a la moza' });
  expect(await within(zona).findByText('¡Listo! Ya le avisamos.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Llamar a la moza' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Pedir la cuenta' })).toBeEnabled();
});

it('entrando por QR muestra el sello MESA con el nombre de la mesa', async () => {
  servidor(mesaAbierta);
  montar();
  const sello = await screen.findByLabelText('Mesa 3');
  expect(sello).toHaveTextContent('MESA');
  expect(sello).toHaveTextContent('3');
});
