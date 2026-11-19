import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvisoImpresion } from './AvisoImpresion';
import { puenteFalso } from '../pruebas';
import type { TrabajoImpresion } from '../../compartido/impresion';

const conError: TrabajoImpresion[] = [
  {
    id: 'j1', tipo: 'comanda', pedidoId: 'p1', titulo: 'Comanda Cocina · Pedido 12', estado: 'error',
    error: 'La impresora no aceptó el trabajo.', creadaEn: '2026-11-18T21:00:00.000Z', impresaEn: null,
  },
];

it('muestra el ticket que no salió y permite reintentarlo', async () => {
  const p = puenteFalso({ 'impresion:trabajos': () => ({ conError, recientes: conError }) });
  render(<AvisoImpresion />);
  const aviso = await screen.findByRole('alert');
  expect(aviso).toHaveTextContent('No se imprimió: Comanda Cocina · Pedido 12');
  expect(aviso).toHaveTextContent('La impresora no aceptó el trabajo.');
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:reintentar', { id: 'j1' });
});

it('descartar pide confirmación', async () => {
  const p = puenteFalso({ 'impresion:trabajos': () => ({ conError, recientes: conError }) });
  render(<AvisoImpresion />);
  await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  expect(p.invocar).not.toHaveBeenCalledWith('impresion:descartar', expect.anything());
  await userEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:descartar', { id: 'j1' });
});

it('sin errores no muestra nada y se actualiza con impresion:cambio', async () => {
  let lista: TrabajoImpresion[] = [];
  const p = puenteFalso({ 'impresion:trabajos': () => ({ conError: lista, recientes: lista }) });
  render(<AvisoImpresion />);
  await Promise.resolve();
  expect(screen.queryByRole('alert')).toBeNull();
  lista = conError;
  p.emitir('impresion:cambio', null);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
