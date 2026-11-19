import { expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VistaPrevia } from './VistaPrevia';
import { puenteFalso } from '../pruebas';

it('muestra cada ticket que se "imprime" en vista previa', async () => {
  const p = puenteFalso({});
  render(<VistaPrevia />);
  expect(screen.queryByRole('complementary')).toBeNull();
  act(() =>
    p.emitir('impresion:vista', {
      columnas: 48,
      documento: { titulo: 'Comanda Cocina · Pedido 1', lineas: [{ tipo: 'texto', texto: 'Mesa 3', tam: 'doble' }] },
    }),
  );
  const panel = screen.getByRole('complementary', { name: 'Vista previa de impresión' });
  expect(panel).toHaveTextContent('Mesa 3');
  expect(screen.getByRole('figure', { name: 'Comanda Cocina · Pedido 1' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByRole('complementary')).toBeNull();
});
