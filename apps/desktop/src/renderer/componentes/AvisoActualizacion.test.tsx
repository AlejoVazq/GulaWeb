import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { puenteFalso } from '../pruebas';
import { AvisoActualizacion } from './AvisoActualizacion';

it('no muestra nada si la app está al día', async () => {
  puenteFalso({ 'app:actualizacion': () => ({ tipo: 'al-dia', version: '1.0.0' }) });
  const { container } = render(<AvisoActualizacion />);
  await Promise.resolve();
  expect(container).toBeEmptyDOMElement();
});

it('ofrece reiniciar cuando la versión nueva ya bajó', async () => {
  const p = puenteFalso({ 'app:actualizacion': () => ({ tipo: 'lista', version: '1.1.0' }), 'app:instalarActualizacion': () => undefined });
  render(<AvisoActualizacion />);
  await userEvent.click(await screen.findByRole('button', { name: 'Reiniciar ahora' }));
  expect(screen.getByRole('status')).toHaveTextContent('1.1.0');
  expect(p.invocar).toHaveBeenCalledWith('app:instalarActualizacion');
});
