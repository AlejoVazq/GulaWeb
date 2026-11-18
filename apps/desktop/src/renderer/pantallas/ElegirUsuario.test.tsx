import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ElegirUsuario } from './ElegirUsuario';
import { puenteFalso } from '../pruebas';

it('envía el PIN del teclado en pantalla y muestra el error', async () => {
  const p = puenteFalso({
    'sesion:usuarios': () => [
      { id: 'u1', nombre: 'Ale', rol: 'dueno' },
      { id: 'u2', nombre: 'Ana', rol: 'mesero' },
    ],
    'sesion:elegirUsuario': () => {
      throw { codigo: 'PIN_INCORRECTO', mensaje: 'PIN incorrecto.' };
    },
  });
  render(<ElegirUsuario local={{ id: 'l1', nombre: 'Bar La Gula', slug: 'bar' }} />);
  await userEvent.click(await screen.findByRole('button', { name: /Ana/ }));
  for (const d of ['4', '3', '2', '1']) await userEvent.click(screen.getByRole('button', { name: d }));
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('PIN incorrecto.');
  expect(p.invocar).toHaveBeenCalledWith('sesion:elegirUsuario', { usuarioId: 'u2', pin: '4321' });
});

it('acepta el teclado físico', async () => {
  const p = puenteFalso({
    'sesion:usuarios': () => [{ id: 'u2', nombre: 'Ana', rol: 'mesero' }],
    'sesion:elegirUsuario': () => ({ tipo: 'activa' }),
  });
  render(<ElegirUsuario local={{ id: 'l1', nombre: 'Bar', slug: 'bar' }} />);
  await userEvent.click(await screen.findByRole('button', { name: /Ana/ }));
  await userEvent.keyboard('9876{Enter}');
  expect(p.invocar).toHaveBeenCalledWith('sesion:elegirUsuario', { usuarioId: 'u2', pin: '9876' });
});
