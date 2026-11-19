import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetalleMesa } from './DetalleMesa';
import { puenteFalso } from '../pruebas';
import { cartaSalon } from '../fixturasSalon';
import type { DetalleMesa as Detalle } from '../../compartido/salon';

const detalle: Detalle = {
  mesa: { id: 'm1', nombre: 'Mesa 3', zona: null, capacidad: null, orden: 0, token: 't' },
  sesion: { id: 's1', mesaId: 'm1', estado: 'abierta', comensales: 2, abiertaPor: 'u1', abiertaEn: '2026-11-18T21:00:00.000Z', cerradaPor: null, cerradaEn: null },
  pedidos: [
    {
      id: 'p1', origen: 'manual', estado: 'confirmado', sesionId: 's1', mesaId: 'm1', numero: 4, dia: '2026-11-18', notas: null,
      motivoRechazo: null, creadoPor: 'u1', confirmadoPor: 'u1', confirmadoEn: '2026-11-18T21:05:00.000Z', rechazadoEn: null,
      creadoEn: '2026-11-18T21:05:00.000Z', total: 1300000,
      items: [
        {
          id: 'i1', pedidoId: 'p1', productoId: 'x', nombre: 'Clásica', precioUnitario: 650000, cantidad: 2, seleccion: {},
          resumenOpciones: 'Doble', nota: 'sin cebolla', sectorId: null, anulado: false, creadoEn: '2026-11-18T21:05:00.000Z',
        },
      ],
    },
  ],
  avisos: [{ id: 'a1', sesionId: 's1', tipo: 'llamar', atendidoPor: null, atendidoEn: null, creadoEn: '2026-11-18T21:10:00.000Z' }],
};

it('muestra los pedidos con número, ítems y total', async () => {
  puenteFalso({ 'salon:mesa': () => detalle });
  render(<DetalleMesa mesaId="m1" onVolver={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Mesa 3' })).toBeInTheDocument();
  const pedido = screen.getByRole('article', { name: 'Pedido 4' });
  expect(within(pedido).getByText('2× Clásica')).toBeInTheDocument();
  expect(within(pedido).getByText('Doble · sin cebolla')).toBeInTheDocument();
  expect(within(pedido).getByText('Confirmado')).toBeInTheDocument();
  expect(screen.getByText(/Total de la mesa/)).toHaveTextContent('13.000');
});

it('"Atendido" atiende el aviso', async () => {
  const p = puenteFalso({ 'salon:mesa': () => detalle });
  render(<DetalleMesa mesaId="m1" onVolver={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Atendido: llamó a la moza' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:atenderAviso', { avisoId: 'a1' });
});

it('"Cerrar mesa" pide confirmación antes de cerrar', async () => {
  const p = puenteFalso({ 'salon:mesa': () => detalle });
  const onVolver = vi.fn();
  render(<DetalleMesa mesaId="m1" onVolver={onVolver} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cerrar mesa' }));
  expect(p.invocar).not.toHaveBeenCalledWith('salon:cerrarMesa', expect.anything());
  expect(screen.getByText('¿Cerrar Mesa 3? Se libera para los próximos clientes.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sí, cerrar' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:cerrarMesa', { sesionId: 's1' });
  expect(onVolver).toHaveBeenCalled();
});

it('"Nuevo pedido" toma el pedido y lo crea en la mesa', async () => {
  const p = puenteFalso({
    'salon:mesa': () => detalle,
    'carta:leer': () => cartaSalon,
    'salon:crearPedido': () => ({ pedidoId: 'n', numero: 5 }),
  });
  render(<DetalleMesa mesaId="m1" onVolver={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nuevo pedido' }));
  await userEvent.click(await screen.findByRole('button', { name: /Gaseosa/ }));
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Gaseosa' })).getByRole('button', { name: /Agregar/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Enviar a cocina' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:crearPedido', {
    origen: 'manual',
    sesionId: 's1',
    items: [{ productoId: 'p3', seleccion: {}, nota: '', cantidad: 1 }],
  });
  expect(await screen.findByText('Pedido 5 enviado.')).toBeInTheDocument();
});

it('"Imprimir cuenta" y "Reimprimir" mandan a imprimir', async () => {
  const p = puenteFalso({ 'salon:mesa': () => detalle });
  render(<DetalleMesa mesaId="m1" onVolver={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Imprimir cuenta' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:cuenta', { sesionId: 's1' });
  const pedido = screen.getByRole('article', { name: 'Pedido 4' });
  await userEvent.click(within(pedido).getByRole('button', { name: 'Reimprimir' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:reimprimir', { pedidoId: 'p1' });
  expect(await screen.findByRole('status')).toHaveTextContent('Enviado a imprimir.');
});
