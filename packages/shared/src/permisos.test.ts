import { it, expect } from 'vitest';
import { puede, ACCIONES } from './permisos.js';

it('mesero', () => {
  expect(puede('mesero', 'pedido.tomar')).toBe('si');
  expect(puede('mesero', 'pedido.confirmar')).toBe('si');
  expect(puede('mesero', 'carta.disponibilidad')).toBe('si');
  expect(puede('mesero', 'cobro.registrar')).toBe('no');
  expect(puede('mesero', 'carta.editar')).toBe('no');
  expect(puede('mesero', 'pedido.anular')).toBe('con_autorizacion');
  expect(puede('mesero', 'impresion.configurar')).toBe('no');
  expect(puede('encargado', 'impresion.configurar')).toBe('si');
});
it('encargado', () => {
  expect(puede('encargado', 'caja.operar')).toBe('si');
  expect(puede('encargado', 'reportes.ver')).toBe('si');
  expect(puede('encargado', 'reportes.resultado')).toBe('no');
  expect(puede('encargado', 'admin.configurar')).toBe('no');
});
it('dueño puede todo', () => {
  for (const a of ACCIONES) expect(puede('dueno', a)).toBe('si');
});
it('ACCIONES tiene exactamente 16 acciones', () => {
  expect(ACCIONES).toHaveLength(16);
});
