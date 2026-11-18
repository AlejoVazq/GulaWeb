import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from './Login';
import { puenteFalso } from '../pruebas';

it('muestra el error de la API', async () => {
  const p = puenteFalso({
    'sesion:login': () => {
      throw { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Email o contraseña incorrectos.' };
    },
  });
  render(<Login servidor="http://localhost:3000" />);
  await userEvent.type(screen.getByLabelText('Email'), 'a@a.com');
  await userEvent.type(screen.getByLabelText('Contraseña'), 'malmal123');
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
  expect(p.invocar).toHaveBeenCalledWith('sesion:login', {
    email: 'a@a.com',
    password: 'malmal123',
    nombrePc: 'PC caja',
    servidor: 'http://localhost:3000',
  });
});
