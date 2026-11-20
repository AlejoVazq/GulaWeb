import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

it('el riel marca la sección activa con aria-current y el cartel muestra su nombre y resumen', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  puenteFalso({
    'sesion:estado': () => ({
      tipo: 'activa',
      local: { id: 'l1', nombre: 'Gula', slug: 'gula' },
      usuario: { id: 'u1', nombre: 'Sofía', rol: 'dueno' },
    }),
    'sync:estado': () => ({ conexion: 'en-linea', pendientes: 0, rechazadas: 0, ultimaSync: null }),
    'salon:leer': () => ({ mesas: [], avisos: [], pendientes: [] }),
    'impresion:trabajos': () => ({ conError: [], recientes: [] }),
  });
  render(<App />);
  const riel = await screen.findByRole('navigation', { name: 'Secciones' });
  expect(within(riel).getByRole('button', { name: 'Mesas' })).toHaveAttribute('aria-current', 'page');
  const cartel = screen.getByRole('banner');
  expect(within(cartel).getByRole('heading', { name: 'Mesas' })).toBeInTheDocument();
  await userEvent.click(within(riel).getByRole('button', { name: 'Carta' }));
  expect(within(screen.getByRole('banner')).getByRole('heading', { name: 'Carta' })).toBeInTheDocument();
  expect(within(riel).getByText('Gula')).toBeInTheDocument();
  // Fuera de Mesas y sin nada entrando, la columna se esconde.
  expect(screen.queryByRole('heading', { name: /^Entrando/ })).not.toBeInTheDocument();
  await userEvent.click(within(riel).getByRole('button', { name: 'Mesas' }));
  expect(screen.getByRole('heading', { name: /^Entrando/ })).toBeInTheDocument();
});

function sesionCon(logo?: string | null) {
  puenteFalso({
    'sesion:estado': () => ({
      tipo: 'activa',
      local: { id: 'l1', nombre: 'Gula', slug: 'gula', ...(logo === undefined ? {} : { logo }) },
      usuario: { id: 'u1', nombre: 'Sofía', rol: 'dueno' },
    }),
    'sync:estado': () => ({ conexion: 'en-linea', pendientes: 0, rechazadas: 0, ultimaSync: null }),
    'salon:leer': () => ({ mesas: [], avisos: [], pendientes: [] }),
    'impresion:trabajos': () => ({ conError: [], recientes: [] }),
  });
}

it('sin logo el riel muestra solo el nombre del local', async () => {
  sesionCon(undefined);
  const { container } = render(<App />);
  const riel = await screen.findByRole('navigation', { name: 'Secciones' });
  expect(within(riel).getByText('Gula')).toBeInTheDocument();
  expect(container.querySelector('.riel__logo')).toBeNull();
});

it('con logo el riel lo muestra junto al nombre, y si no carga lo esconde', async () => {
  const { fireEvent } = await import('@testing-library/react');
  sesionCon('https://vaztech.com.ar/marcas/gula-hoja.svg');
  const { container } = render(<App />);
  const riel = await screen.findByRole('navigation', { name: 'Secciones' });
  const img = container.querySelector('.riel__logo') as HTMLImageElement;
  expect(img).toHaveAttribute('src', 'https://vaztech.com.ar/marcas/gula-hoja.svg');
  expect(img).toHaveAttribute('alt', '');
  expect(within(riel).getByText('Gula')).toBeInTheDocument();
  fireEvent.error(img);
  expect(container.querySelector('.riel__logo')).toBeNull();
});
