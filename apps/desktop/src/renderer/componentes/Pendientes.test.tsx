import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Alerta } from './Alerta';
import { Pendientes } from './Pendientes';
import { puenteFalso } from '../pruebas';
import type { PedidoPendiente, Salon } from '../../compartido/salon';

afterEach(() => vi.useRealTimers());

const pendiente: PedidoPendiente = {
  id: 'q1', origen: 'qr', estado: 'pendiente', sesionId: 's1', mesaId: 'm3', numero: null, dia: null, notas: null,
  motivoRechazo: null, creadoPor: null, confirmadoPor: null, confirmadoEn: null, rechazadoEn: null,
  creadoEn: '2026-11-18T21:15:00.000Z', total: 1650000, mesa: { id: 'm3', nombre: 'Mesa 3' },
  items: [
    { id: 'i1', pedidoId: 'q1', productoId: 'p1', nombre: 'Clásica', precioUnitario: 650000, cantidad: 2, seleccion: {}, resumenOpciones: 'Doble', nota: '', sectorId: null, anulado: false, creadoEn: '' },
    { id: 'i2', pedidoId: 'q1', productoId: 'p3', nombre: 'Gaseosa', precioUnitario: 350000, cantidad: 1, seleccion: {}, resumenOpciones: '', nota: '', sectorId: null, anulado: false, creadoEn: '' },
  ],
};
const conPendiente: Salon = { mesas: [], pendientes: [pendiente], avisos: [] };
const conAviso: Salon = {
  mesas: [],
  pendientes: [],
  avisos: [{ id: 'a1', sesionId: 's4', tipo: 'cuenta', atendidoPor: null, atendidoEn: null, creadoEn: '2026-11-18T21:20:00.000Z', mesa: { id: 'm4', nombre: 'Mesa 4' } }],
};

it('con un pendiente suena enseguida y vuelve a sonar a los 8 s', () => {
  vi.useFakeTimers();
  const reproducir = vi.fn();
  render(<Alerta activa reproducir={reproducir} />);
  expect(reproducir).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(7_999));
  expect(reproducir).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(1));
  expect(reproducir).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(16_000));
  expect(reproducir).toHaveBeenCalledTimes(4);
  expect(screen.getByRole('status')).toHaveTextContent('Hay pedidos o avisos sin atender');
});

it('cuando no queda nada sin atender deja de sonar', () => {
  vi.useFakeTimers();
  const reproducir = vi.fn();
  const { rerender } = render(<Alerta activa reproducir={reproducir} />);
  rerender(<Alerta activa={false} reproducir={reproducir} />);
  act(() => vi.advanceTimersByTime(60_000));
  expect(reproducir).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Hay pedidos o avisos sin atender')).not.toBeInTheDocument();
});

it('"Silenciar 1 minuto" suspende el sonido y lo retoma si sigue habiendo pendientes', async () => {
  vi.useFakeTimers();
  const reproducir = vi.fn();
  render(<Alerta activa reproducir={reproducir} />);
  act(() => screen.getByRole('button', { name: 'Silenciar 1 minuto' }).click());
  act(() => vi.advanceTimersByTime(59_000));
  expect(reproducir).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toHaveTextContent('silenciado');
  act(() => vi.advanceTimersByTime(1_000));
  expect(reproducir).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(8_000));
  expect(reproducir).toHaveBeenCalledTimes(3);
});

it('un pedido nuevo mientras está silenciado vuelve a sonar', () => {
  vi.useFakeTimers();
  const reproducir = vi.fn();
  const { rerender } = render(<Alerta activa cantidad={1} reproducir={reproducir} />);
  act(() => screen.getByRole('button', { name: 'Silenciar 1 minuto' }).click());
  rerender(<Alerta activa cantidad={2} reproducir={reproducir} />);
  expect(reproducir).toHaveBeenCalledTimes(2);
});

it('la bandeja muestra mesa, ítems y confirma con las cantidades ajustadas', async () => {
  const p = puenteFalso({ 'salon:confirmar': () => ({ numero: 7 }) });
  render(<Pendientes salon={conPendiente} />);
  expect(screen.getByRole('heading', { name: /^Entrando/ })).toHaveTextContent('1');
  const tarjeta = screen.getByRole('article', { name: /Mesa 3/ });
  expect(within(tarjeta).getByText('Doble')).toBeInTheDocument();
  await userEvent.click(within(tarjeta).getByRole('button', { name: 'Quitar uno de Gaseosa' }));
  await userEvent.click(within(tarjeta).getByRole('button', { name: 'Aceptar e imprimir' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:confirmar', { pedidoId: 'q1', ajustes: [{ itemId: 'i2', cantidad: 0 }] });
});

it('confirmar sin cambios no manda ajustes', async () => {
  const p = puenteFalso({ 'salon:confirmar': () => ({ numero: 7 }) });
  render(<Pendientes salon={conPendiente} />);
  await userEvent.click(screen.getByRole('button', { name: 'Aceptar e imprimir' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:confirmar', { pedidoId: 'q1', ajustes: [] });
});

it('rechazar exige un motivo y ofrece sugerencias', async () => {
  const p = puenteFalso({});
  render(<Pendientes salon={conPendiente} />);
  await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
  const enviar = screen.getByRole('button', { name: 'Rechazar pedido' });
  expect(enviar).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Sin stock' }));
  expect(screen.getByLabelText('Motivo')).toHaveValue('Sin stock');
  await userEvent.click(enviar);
  expect(p.invocar).toHaveBeenCalledWith('salon:rechazar', { pedidoId: 'q1', motivo: 'Sin stock' });
});

it('los avisos se atienden desde la bandeja', async () => {
  const p = puenteFalso({});
  render(<Pendientes salon={conAviso} />);
  expect(screen.getByText('Mesa 4 · Pidió la cuenta')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Atendido' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:atenderAviso', { avisoId: 'a1' });
});

it('sin nada entrando lo dice', () => {
  puenteFalso({});
  render(<Pendientes salon={{ mesas: [], pendientes: [], avisos: [] }} />);
  expect(screen.getByText('Nada entrando por ahora.')).toBeInTheDocument();
});

it('un pedido pendiente aparece como papel de comanda con su mesa y sus líneas', () => {
  puenteFalso({});
  render(<Pendientes salon={conPendiente} />);
  const papel = screen.getByRole('article', { name: /Mesa 3/ });
  expect(papel).toHaveClass('papel');
  expect(within(papel).getByText('MESA 3')).toBeInTheDocument();
  expect(papel.querySelectorAll('.papel__linea').length).toBeGreaterThan(0);
});
