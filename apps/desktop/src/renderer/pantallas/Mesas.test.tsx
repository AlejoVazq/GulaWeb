import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mesas } from './Mesas';
import { puenteFalso } from '../pruebas';
import type { MesaSalon, Salon } from '../../compartido/salon';

const AHORA = new Date('2026-11-18T21:30:00.000Z');
const mesa = (id: string, nombre: string, extra: Partial<MesaSalon> = {}): MesaSalon => ({
  id,
  nombre,
  zona: 'Salón',
  capacidad: 4,
  orden: 0,
  token: 't',
  sesion: null,
  pendientes: 0,
  avisos: [],
  ...extra,
});
const sesion = (id: string, mesaId: string, estado: 'abierta' | 'cuenta_pedida' = 'abierta') => ({
  id,
  mesaId,
  estado,
  comensales: 3,
  abiertaPor: 'u1',
  abiertaEn: '2026-11-18T21:00:00.000Z',
  cerradaPor: null,
  cerradaEn: null,
});

const salon: Salon = {
  mesas: [
    mesa('m1', 'Mesa 1'),
    mesa('m2', 'Mesa 2', { sesion: sesion('s2', 'm2') }),
    mesa('m3', 'Mesa 3', { sesion: sesion('s3', 'm3'), pendientes: 1 }),
    mesa('m4', 'Mesa 4', {
      sesion: sesion('s4', 'm4'),
      avisos: [{ id: 'a1', sesionId: 's4', tipo: 'llamar', atendidoPor: null, atendidoEn: null, creadoEn: '2026-11-18T21:20:00.000Z' }],
    }),
    mesa('m5', 'Mesa 5', { zona: 'Vereda', sesion: sesion('s5', 'm5', 'cuenta_pedida') }),
  ],
  pendientes: [],
  avisos: [],
};

const tarjeta = (nombre: string) => screen.getByRole('button', { name: new RegExp(`^${nombre}\\b`) });

it('cada mesa dice su estado con texto, agrupadas por zona', () => {
  puenteFalso({});
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  expect(within(tarjeta('Mesa 1')).getByText('Libre')).toBeInTheDocument();
  expect(within(tarjeta('Mesa 2')).getByText('Abierta')).toBeInTheDocument();
  expect(within(tarjeta('Mesa 2')).getByText('3 personas · 30 min')).toBeInTheDocument();
  expect(within(tarjeta('Mesa 3')).getByText('Pedido nuevo')).toBeInTheDocument();
  expect(within(tarjeta('Mesa 4')).getByText('Llamó a la moza')).toBeInTheDocument();
  expect(within(tarjeta('Mesa 5')).getByText('Pidió la cuenta')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Salón' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Vereda' })).toBeInTheDocument();
});

it('abrir una mesa libre llama a salon:abrirMesa con los comensales y lleva al detalle', async () => {
  const p = puenteFalso({ 'salon:abrirMesa': () => ({ sesionId: 'nueva' }) });
  const onVerMesa = vi.fn();
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={onVerMesa} onMostrador={vi.fn()} />);
  await userEvent.click(tarjeta('Mesa 1'));
  const dialogo = screen.getByRole('dialog', { name: 'Abrir Mesa 1' });
  await userEvent.type(within(dialogo).getByLabelText('Personas (opcional)'), '4');
  await userEvent.click(within(dialogo).getByRole('button', { name: 'Abrir mesa' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:abrirMesa', { mesaId: 'm1', comensales: 4 });
  expect(onVerMesa).toHaveBeenCalledWith('m1');
});

it('abrir sin indicar personas manda null', async () => {
  const p = puenteFalso({ 'salon:abrirMesa': () => ({ sesionId: 'nueva' }) });
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  await userEvent.click(tarjeta('Mesa 1'));
  await userEvent.click(screen.getByRole('button', { name: 'Abrir mesa' }));
  expect(p.invocar).toHaveBeenCalledWith('salon:abrirMesa', { mesaId: 'm1', comensales: null });
});

it('una mesa ocupada abre su detalle', async () => {
  puenteFalso({});
  const onVerMesa = vi.fn();
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={onVerMesa} onMostrador={vi.fn()} />);
  await userEvent.click(tarjeta('Mesa 3'));
  expect(onVerMesa).toHaveBeenCalledWith('m3');
});

it('el botón de mostrador avisa', async () => {
  puenteFalso({});
  const onMostrador = vi.fn();
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={onMostrador} />);
  await userEvent.click(screen.getByRole('button', { name: 'Pedido de mostrador' }));
  expect(onMostrador).toHaveBeenCalled();
});

it('sin mesas explica cómo cargarlas', () => {
  puenteFalso({});
  render(<Mesas salon={{ mesas: [], pendientes: [], avisos: [] }} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  expect(screen.getByText(/Todavía no hay mesas/)).toBeInTheDocument();
});

it('los pedidos de mostrador sin cobrar se listan con su total y "Cobrar"', async () => {
  puenteFalso({});
  const onCobrar = vi.fn();
  const pedido = {
    id: 'pm', origen: 'mostrador' as const, estado: 'confirmado' as const, sesionId: null, mesaId: null, numero: 7, dia: '2026-11-18',
    notas: null, motivoRechazo: null, creadoPor: 'u', confirmadoPor: 'u', confirmadoEn: '2026-11-18T21:00:00.000Z', rechazadoEn: null,
    creadoEn: '2026-11-18T21:00:00.000Z', items: [], total: 450000,
  };
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} porCobrar={[pedido]} onCobrar={onCobrar} />);
  const bloque = screen.getByRole('region', { name: 'Mostrador por cobrar' });
  expect(within(bloque).getByText(/Pedido 7/)).toBeInTheDocument();
  expect(within(bloque).getByText('$ 4.500')).toBeInTheDocument();
  await userEvent.click(within(bloque).getByRole('button', { name: 'Cobrar pedido 7' }));
  expect(onCobrar).toHaveBeenCalledWith(pedido);
});

it('filtro "Libres" muestra solo mesas sin sesión y "Abiertas" las ocupadas', async () => {
  puenteFalso({});
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Libres' }));
  expect(screen.getByRole('button', { name: 'Libres' })).toHaveAttribute('aria-pressed', 'true');
  expect(tarjeta('Mesa 1')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Mesa 2\b/ })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Abiertas' }));
  expect(screen.queryByRole('button', { name: /^Mesa 1\b/ })).not.toBeInTheDocument();
  expect(tarjeta('Mesa 5')).toBeInTheDocument();
});

it('la placa muestra el número de la mesa', () => {
  puenteFalso({});
  render(<Mesas salon={salon} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  expect(tarjeta('Mesa 3').querySelector('.mesa__placa')).toHaveTextContent(/^3$/);
});

it('30 mesas con nombres largos se renderizan todas con su nombre completo', () => {
  puenteFalso({});
  const muchas = Array.from({ length: 30 }, (_, i) => mesa(`x${i}`, i % 2 ? `Patio ${i}` : `Barra del fondo ${i}`));
  render(<Mesas salon={{ mesas: muchas, pendientes: [], avisos: [] }} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  for (const m of muchas) expect(tarjeta(m.nombre)).toBeInTheDocument();
});

it('un nombre con número al final lleva el número en la placa y el lugar como rótulo', () => {
  puenteFalso({});
  const ms = [mesa('a', 'Patio cubierto 12'), mesa('b', 'Salón privado VIP'), mesa('c', 'Mesa 4')];
  render(<Mesas salon={{ mesas: ms, pendientes: [], avisos: [] }} ahora={AHORA} onVerMesa={vi.fn()} onMostrador={vi.fn()} />);
  const patio = tarjeta('Patio cubierto 12');
  expect(patio.querySelector('.mesa__placa')).toHaveTextContent(/^12$/);
  expect(patio.querySelector('.mesa__lugar')).toHaveTextContent('Patio cubierto');
  expect(tarjeta('Salón privado VIP').querySelector('.mesa__placa')).toHaveTextContent('Salón privado VIP');
  expect(tarjeta('Mesa 4').querySelector('.mesa__lugar')).toBeNull();
});
