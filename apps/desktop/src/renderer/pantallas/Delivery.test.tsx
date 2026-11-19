import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Delivery } from './Delivery';
import { puenteFalso } from '../pruebas';
import type { PedidoDelivery, TableroDelivery } from '../../compartido/delivery';

const T = '2026-11-19T21:00:00.000Z';
const delivery = (id: string, extra: Partial<PedidoDelivery> = {}, reparto: Partial<PedidoDelivery['delivery']> = {}): PedidoDelivery => ({
  id, origen: 'delivery', estado: 'confirmado', sesionId: null, mesaId: null, numero: Number(id.slice(1)), dia: '2026-11-19', notas: null,
  motivoRechazo: null, creadoPor: 'u1', confirmadoPor: 'u1', confirmadoEn: T, rechazadoEn: null, creadoEn: T,
  items: [{ id: `${id}-i`, pedidoId: id, productoId: 'p3', nombre: 'Gaseosa', precioUnitario: 1000000, cantidad: 1, seleccion: {}, resumenOpciones: '', nota: '', sectorId: null, anulado: false, creadoEn: T }],
  total: 1000000,
  aCobrar: 1150000,
  delivery: {
    cliente: { nombre: `Cliente ${id}`, telefono: '1155551234', direccion: `Calle ${id}`, referencias: '' },
    costoEnvio: 150000, pagaCon: null, repartidor: null, estado: 'preparando', enCaminoEn: null, entregadoEn: null, ...reparto,
  },
  ...extra,
});
const tablero = (t: Partial<TableroDelivery>): TableroDelivery => ({ preparando: [], enCamino: [], entregados: [], cancelados: [], ...t });

it('"Salió" pide el repartidor y pasa a en camino', async () => {
  const p = puenteFalso({ 'delivery:tablero': () => tablero({ preparando: [delivery('d1')] }), 'delivery:config': () => ({ envio: 0 }) });
  render(<Delivery rol="mesero" />);
  const tarjeta = await screen.findByRole('article', { name: /Pedido 1/ });
  expect(tarjeta).toHaveTextContent('Calle d1');
  expect(tarjeta).toHaveTextContent('$ 11.500');
  await userEvent.click(within(tarjeta).getByRole('button', { name: 'Salió' }));
  await userEvent.type(screen.getByLabelText('Repartidor'), 'Juan');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }));
  expect(p.invocar).toHaveBeenCalledWith('delivery:estado', { pedidoId: 'd1', estado: 'en_camino', repartidor: 'Juan' });
});

it('"Entregado" sin cobrar abre el cobro con el envío y al cobrar lo entrega', async () => {
  const p = puenteFalso({
    'delivery:tablero': () => tablero({ enCamino: [delivery('d2', {}, { estado: 'en_camino', repartidor: 'Juan' })] }),
    'delivery:config': () => ({ envio: 0 }),
    'caja:cobrar': () => ({ cobroId: 'c1', total: 1150000 }),
  });
  render(<Delivery rol="encargado" />);
  const tarjeta = await screen.findByRole('article', { name: /Pedido 2/ });
  await userEvent.click(within(tarjeta).getByRole('button', { name: 'Entregado' }));
  const dialogo = await screen.findByRole('dialog', { name: /Cobrar/ });
  expect(dialogo).toHaveTextContent('Subtotal $ 11.500');
  await userEvent.click(within(dialogo).getByRole('button', { name: 'Cobrar' }));
  expect(p.invocar).toHaveBeenCalledWith('caja:cobrar', expect.objectContaining({ destino: { pedidoId: 'd2' } }));
  expect(p.invocar).toHaveBeenCalledWith('delivery:estado', { pedidoId: 'd2', estado: 'entregado' });
});

it('uno ya cobrado se entrega directo', async () => {
  const p = puenteFalso({
    'delivery:tablero': () => tablero({ enCamino: [delivery('d3', { estado: 'cobrado' }, { estado: 'en_camino' })] }),
    'delivery:config': () => ({ envio: 0 }),
  });
  render(<Delivery rol="mesero" />);
  const tarjeta = await screen.findByRole('article', { name: /Pedido 3/ });
  expect(tarjeta).toHaveTextContent('Cobrado');
  await userEvent.click(within(tarjeta).getByRole('button', { name: 'Entregado' }));
  expect(p.invocar).toHaveBeenCalledWith('delivery:estado', { pedidoId: 'd3', estado: 'entregado' });
});

it('un cancelado no tiene botones', async () => {
  puenteFalso({
    'delivery:tablero': () => tablero({ cancelados: [delivery('d4', { estado: 'anulado', motivoAnulacion: 'Canceló' })] }),
    'delivery:config': () => ({ envio: 0 }),
  });
  render(<Delivery rol="dueno" />);
  const tarjeta = await screen.findByRole('article', { name: /Pedido 4/ });
  expect(tarjeta).toHaveTextContent('Canceló');
  expect(within(tarjeta).queryAllByRole('button')).toEqual([]);
});
