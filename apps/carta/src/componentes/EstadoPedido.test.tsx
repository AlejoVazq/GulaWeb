import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { PedidoPublico } from '@gula/shared';
import { EstadoPedido } from './EstadoPedido';

const base: PedidoPublico = {
  id: '01900000-0000-7000-8000-000000000001',
  estado: 'pendiente',
  motivoRechazo: null,
  total: 650000,
  items: [
    { nombre: 'Hamburguesa clásica', cantidad: 1, resumenOpciones: 'Grande', subtotal: 650000 },
  ],
};
const json = (c: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(c), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function avanzar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it('pendiente lleva el sello ENVIADO y al confirmarse CONFIRMADO', async () => {
  let estado: PedidoPublico['estado'] = 'pendiente';
  const f = vi.fn(() => json({ ...base, estado }));
  vi.stubGlobal('fetch', f);
  render(<EstadoPedido token="TOKEN" pedido={base} />);
  expect(screen.getByRole('status')).toHaveTextContent('ENVIADO');
  expect(screen.getByText('Esperando que lo confirmen en la barra.')).toBeInTheDocument();
  await avanzar(5_000);
  expect(f).toHaveBeenCalledWith(`/api/publico/pedidos/${base.id}?token=TOKEN`, expect.anything());
  expect(screen.getByRole('status')).toHaveTextContent('ENVIADO');
  estado = 'confirmado';
  await avanzar(5_000);
  expect(screen.getByRole('status')).toHaveTextContent('CONFIRMADO');
  const llamadas = f.mock.calls.length;
  await avanzar(30_000);
  expect(f.mock.calls.length).toBe(llamadas); // ya no consulta más
});

it('rechazado muestra el motivo', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => json({ ...base, estado: 'rechazado', motivoRechazo: 'Sin stock' })),
  );
  render(<EstadoPedido token="TOKEN" pedido={base} />);
  await avanzar(5_000);
  expect(screen.getByText('No pudimos tomar tu pedido: Sin stock')).toBeInTheDocument();
});

it('al volver a la pestaña consulta enseguida', async () => {
  const f = vi.fn(() => json(base));
  vi.stubGlobal('fetch', f);
  render(<EstadoPedido token="TOKEN" pedido={base} />);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(f).toHaveBeenCalledTimes(1);
});

it.each([
  ['pendiente', 'ENVIADO'],
  ['confirmado', 'CONFIRMADO'],
  ['rechazado', 'RECHAZADO'],
  ['anulado', 'ANULADO'],
] as const)('talón %s lleva el sello %s y sus líneas', (estado, sello) => {
  vi.stubGlobal('fetch', vi.fn(() => json({ ...base, estado })));
  render(<EstadoPedido token="TOKEN" pedido={{ ...base, estado }} />);
  expect(screen.getByRole('status')).toHaveTextContent(sello);
  expect(screen.getByText('Hamburguesa clásica')).toBeInTheDocument();
  expect(screen.getByText('Grande')).toBeInTheDocument();
});
