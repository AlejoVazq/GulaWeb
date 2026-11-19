import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Anular } from './Anular';
import { puenteFalso } from '../pruebas';

it('una moza elige al encargado y pone su PIN', async () => {
  puenteFalso({ 'sesion:autorizantes': () => [{ id: 'enc', nombre: 'Encargada Laura', rol: 'encargado' }] });
  const onConfirmar = vi.fn(async () => {});
  render(<Anular titulo="Anular 2× Pizza" necesitaPin onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Motivo'), 'Se equivocó la moza');
  await userEvent.selectOptions(await screen.findByLabelText('Autoriza'), 'enc');
  await userEvent.type(screen.getByLabelText('PIN'), '5555');
  await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
  expect(onConfirmar).toHaveBeenCalledWith('Se equivocó la moza', { usuarioId: 'enc', pin: '5555' });
});

it('un encargado anula solo con el motivo', async () => {
  puenteFalso({});
  const onConfirmar = vi.fn(async () => {});
  render(<Anular titulo="Anular pedido 4" necesitaPin={false} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);
  expect(screen.queryByLabelText('PIN')).toBeNull();
  expect(screen.getByRole('button', { name: 'Anular' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Motivo'), 'Cliente se fue');
  await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
  expect(onConfirmar).toHaveBeenCalledWith('Cliente se fue', undefined);
});
