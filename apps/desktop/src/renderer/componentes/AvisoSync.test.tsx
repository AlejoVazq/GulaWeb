import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvisoSync } from './AvisoSync';
import { puenteFalso } from '../pruebas';
import type { EstadoSync, OperacionRechazada } from '../../compartido/ipc';

const sync = (cambios: Partial<EstadoSync> = {}): EstadoSync => ({
  conexion: 'en-linea', pendientes: 0, rechazadas: 2, ultimaSync: null, desfaseReloj: 0, ...cambios,
});
const rechazadas: OperacionRechazada[] = [
  { id: 'o1', tipo: 'mesa.abrir', datos: { mesaId: 'm4' }, error: 'NO_ENCONTRADO', creadaEn: '2026-11-19T20:00:00.000Z', lugar: 'Mesa 4' },
  { id: 'o2', tipo: 'cuenta.cobrar', datos: { subtotal: 1400000 }, error: 'NO_ENCONTRADO', creadaEn: '2026-11-19T20:01:00.000Z', lugar: 'Mesa 4' },
];

it('con dos rechazadas avisa, las explica y "Entendido" las descarta', async () => {
  const p = puenteFalso({ 'sync:rechazadas': () => rechazadas });
  render(<AvisoSync sync={sync()} />);
  await userEvent.click(await screen.findByRole('button', { name: '2 cambios no se guardaron' }));
  const panel = screen.getByRole('dialog', { name: 'Cambios que no se guardaron' });
  expect(panel).toHaveTextContent('No se pudo abrir la Mesa 4: la mesa ya no existe.');
  expect(panel).toHaveTextContent('El cobro de la Mesa 4 no se registró: la mesa ya no existe.');
  await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(p.invocar).toHaveBeenCalledWith('sync:descartarRechazada', { id: 'o1' });
  expect(p.invocar).toHaveBeenCalledWith('sync:descartarRechazada', { id: 'o2' });
});

it('sin rechazadas no muestra nada', async () => {
  puenteFalso({ 'sync:rechazadas': () => [] });
  render(<AvisoSync sync={sync({ rechazadas: 0 })} />);
  await Promise.resolve();
  expect(screen.queryByRole('button')).toBeNull();
});

it('con el reloj 8 minutos corrido avisa la hora de la PC', async () => {
  puenteFalso({ 'sync:rechazadas': () => [] });
  render(<AvisoSync sync={sync({ rechazadas: 0, desfaseReloj: 8 * 60_000 })} />);
  expect(screen.getByRole('alert')).toHaveTextContent('La hora de esta PC está mal (diferencia de 8 min). Corregila en Windows.');
});

it('con menos de 5 minutos de diferencia no avisa', async () => {
  puenteFalso({ 'sync:rechazadas': () => [] });
  render(<AvisoSync sync={sync({ rechazadas: 0, desfaseReloj: -4 * 60_000 })} />);
  expect(screen.queryByRole('alert')).toBeNull();
});
