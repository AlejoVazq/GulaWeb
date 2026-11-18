import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Conexion } from './Conexion';

it('muestra los cambios pendientes sin conexión', () => {
  render(<Conexion estado={{ conexion: 'sin-conexion', pendientes: 3, ultimaSync: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Sin conexión — 3 cambios pendientes');
});
it('en línea y sincronizando', () => {
  const { rerender } = render(<Conexion estado={{ conexion: 'en-linea', pendientes: 0, ultimaSync: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('En línea');
  rerender(<Conexion estado={{ conexion: 'sincronizando', pendientes: 1, ultimaSync: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Sincronizando…');
});
it('singular', () => {
  render(<Conexion estado={{ conexion: 'sin-conexion', pendientes: 1, ultimaSync: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Sin conexión — 1 cambio pendiente');
});
