import { describe, expect, it } from 'vitest';
import type { MesaSalon } from '../compartido/salon';
import type { TableroDelivery } from '../compartido/delivery';
import { COLOR_ESTADO, SECCIONES, resumenDelivery, resumenMesas } from './secciones';

const mesa = (over: Partial<MesaSalon> = {}): MesaSalon =>
  ({ id: Math.random().toString(), nombre: 'Mesa', capacidad: 4, sesion: null, pendientes: 0, avisos: [], ...over }) as MesaSalon;
const abierta = (over: Partial<MesaSalon> = {}) => mesa({ sesion: { estado: 'abierta' } as MesaSalon['sesion'], ...over });

describe('resumenMesas', () => {
  it('cuenta abiertas, cuenta pedida y pendientes y omite ceros', () => {
    const mesas = [
      abierta(),
      abierta({ pendientes: 2 }),
      abierta({ sesion: { estado: 'cuenta_pedida' } as MesaSalon['sesion'] }),
      mesa(),
    ];
    expect(resumenMesas(mesas)).toEqual({ placa: '4', resumen: '3 abiertas · 1 pidió la cuenta · 2 pedidos sin atender' });
    expect(resumenMesas([abierta()]).resumen).toBe('1 abierta');
  });

  it('todas libres → "Todas libres"', () => {
    expect(resumenMesas([mesa(), mesa()])).toEqual({ placa: '2', resumen: 'Todas libres' });
  });

  it('un aviso de cuenta también cuenta como "pidió la cuenta"', () => {
    const m = abierta({ avisos: [{ tipo: 'cuenta' }] as MesaSalon['avisos'] });
    expect(resumenMesas([m]).resumen).toBe('1 abierta · 1 pidió la cuenta');
  });
});

describe('SECCIONES', () => {
  it('cada sección tiene color distinto y ninguno es el rojo o ámbar de estado', () => {
    const colores = Object.values(SECCIONES).map((s) => s.color.toLowerCase());
    expect(new Set(colores).size).toBe(colores.length);
    expect(colores).not.toContain(COLOR_ESTADO.urgente);
    expect(colores).not.toContain(COLOR_ESTADO.cuenta);
  });
});

it('dos mesas con la cuenta pedida → "2 pidieron la cuenta"', () => {
  const c = () => abierta({ sesion: { estado: 'cuenta_pedida' } as MesaSalon['sesion'] });
  expect(resumenMesas([c(), c()]).resumen).toBe('2 abiertas · 2 pidieron la cuenta');
});

describe('resumenDelivery', () => {
  const p = (estado: string, cobrado = false) => ({ estado: cobrado ? 'cobrado' : 'confirmado', delivery: { estado } }) as never;
  it('la placa son los activos y el resumen cuenta preparando, en camino y a cobrar', () => {
    const t = { preparando: [p('preparando'), p('preparando', true)], enCamino: [p('en_camino')], entregados: [p('entregado', true)], cancelados: [] } as TableroDelivery;
    expect(resumenDelivery(t)).toEqual({ placa: '3', resumen: '2 preparando · 1 en camino · 2 a cobrar' });
  });
  it('sin nada activo', () => {
    expect(resumenDelivery({ preparando: [], enCamino: [], entregados: [], cancelados: [] })).toEqual({ placa: '0', resumen: 'Nada en curso' });
    expect(resumenDelivery(null)).toEqual({ placa: '0' });
  });
});
