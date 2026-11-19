import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Impresion } from './Impresion';
import { puenteFalso } from '../pruebas';

it('elige la impresora de Windows y guarda', async () => {
  const p = puenteFalso({
    'impresion:config': () => ({ modo: 'vista_previa', impresora: null, columnas: 48, impresoras: ['Termica 80', 'Otra'] }),
    'impresion:trabajos': () => ({ conError: [], recientes: [] }),
  });
  render(<Impresion />);
  await userEvent.click(await screen.findByRole('radio', { name: 'Impresora' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Impresora de Windows' }), 'Termica 80');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:guardarConfig', { modo: 'impresora', impresora: 'Termica 80', columnas: 48 });
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado');
});

it('imprime una prueba y lista los últimos trabajos', async () => {
  const p = puenteFalso({
    'impresion:config': () => ({ modo: 'vista_previa', impresora: null, columnas: 48, impresoras: [] }),
    'impresion:trabajos': () => ({
      conError: [],
      recientes: [
        { id: 'j1', tipo: 'prueba', pedidoId: null, titulo: 'Prueba de impresión', estado: 'impresa', error: null, creadaEn: '2026-11-18T21:00:00.000Z', impresaEn: '2026-11-18T21:00:01.000Z' },
      ],
    }),
  });
  render(<Impresion />);
  await userEvent.click(await screen.findByRole('button', { name: 'Imprimir prueba' }));
  expect(p.invocar).toHaveBeenCalledWith('impresion:prueba');
  expect(screen.getByText('Prueba de impresión')).toBeInTheDocument();
  expect(screen.getByText('Impresa')).toBeInTheDocument();
});

it('"Imprimir prueba" usa la impresora recién elegida (guarda antes)', async () => {
  const p = puenteFalso({
    'impresion:config': () => ({ modo: 'vista_previa', impresora: null, columnas: 48, impresoras: ['Termica 80'] }),
    'impresion:trabajos': () => ({ conError: [], recientes: [] }),
  });
  render(<Impresion />);
  await userEvent.click(await screen.findByRole('radio', { name: 'Impresora' }));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Impresora de Windows' }), 'Termica 80');
  await userEvent.click(screen.getByRole('button', { name: 'Imprimir prueba' }));
  const canales = p.invocar.mock.calls.map((c) => c[0]);
  expect(canales.indexOf('impresion:guardarConfig')).toBeGreaterThan(-1);
  expect(canales.indexOf('impresion:guardarConfig')).toBeLessThan(canales.indexOf('impresion:prueba'));
});
