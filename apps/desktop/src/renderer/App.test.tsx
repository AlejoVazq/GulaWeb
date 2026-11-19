import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { puenteFalso } from './pruebas';
import type { Salon } from '../compartido/salon';

const salonConPendiente = {
  mesas: [],
  avisos: [],
  pendientes: [{ id: 'q1', mesa: { id: 'm3', nombre: 'Mesa 3' }, items: [], total: 0, creadoEn: '2026-11-18T21:00:00.000Z' }],
} as unknown as Salon;

it('con la PC bloqueada, un pedido pendiente sigue avisando', async () => {
  puenteFalso({
    'sesion:estado': () => ({ tipo: 'bloqueada', local: { id: 'l1', nombre: 'Bar', slug: 'bar' } }),
    'sync:estado': () => ({ conexion: 'en-linea', pendientes: 0, rechazadas: 0, ultimaSync: null }),
    'sesion:usuarios': () => [],
    'salon:leer': () => salonConPendiente,
  });
  render(<App />);
  expect(await screen.findByText('Hay pedidos o avisos sin atender')).toBeInTheDocument();
  expect(screen.getByText('1 pendiente: elegí tu usuario para atenderlo.')).toBeInTheDocument();
});
