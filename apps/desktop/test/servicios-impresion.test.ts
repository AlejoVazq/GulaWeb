import { expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta } from '../src/main/db/carta';
import { aplicarCambiosSalon } from '../src/main/db/salon';
import { crearSesion } from '../src/main/api/sesion';
import { crearServicios } from '../src/main/servicios';
import { crearColaImpresion } from '../src/main/impresion/cola';
import { maquetar, type Documento } from '../src/compartido/impresion';
import { carpetaTemporal } from './tmp';
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
const local = { id: 'l1', nombre: 'Bar Gula', slug: 'bar' };
const T0 = '2026-11-18T20:00:00.000Z';
const meta = { actualizadoEn: T0, eliminadoEn: null };
let n = 0;

async function armar(rol: 'dueno' | 'mesero' = 'mesero') {
  const base: BaseLocal = abrirBase(tmp.ruta(`si${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  aplicarCambiosSalon(base, {
    cursor: T0,
    mesas: [{ id: 'm1', nombre: 'Mesa 1', zona: null, capacidad: null, orden: 0, token: 't', ...meta }],
    sesiones: [
      { id: 's1', mesaId: 'm1', estado: 'abierta', comensales: null, abiertaPor: null, abiertaEn: T0, cerradaPor: null, cerradaEn: null, ...meta },
    ],
    pedidos: [
      {
        id: 'q1', origen: 'qr', estado: 'pendiente', sesionId: 's1', mesaId: 'm1', numero: null, dia: null, notas: null,
        motivoRechazo: null, creadoPor: null, confirmadoPor: null, confirmadoEn: null, rechazadoEn: null, creadoEn: T0, ...meta,
      },
    ],
    items: [
      {
        id: 'qi1', pedidoId: 'q1', productoId: 'p1', nombre: 'Muzza', precioUnitario: 1200000, cantidad: 1, seleccion: {},
        resumenOpciones: '', nota: 'sin aceitunas', sectorId: 's1', anulado: false, creadoEn: T0, ...meta,
      },
    ],
    avisos: [],
  });
  const sesion = crearSesion(base, identidad);
  sesion.guardar({ accessToken: 'a', refreshToken: 'r', usuario: { id: 'u1', nombre: 'Ana', rol }, local, dispositivoId: 'd1' });
  const motor = {
    sincronizarAhora: vi.fn(async () => {}),
    reconectar: vi.fn(),
    iniciar: vi.fn(),
    detener: vi.fn(),
    estado: () => ({ conexion: 'sin-conexion' as const, pendientes: 0, rechazadas: 0, ultimaSync: null, desfaseReloj: null }),
  };
  const cliente = {
    pedir: vi.fn(),
    pin: vi.fn(async () => ({ accessToken: 'b', usuario: { id: 'u1', nombre: 'Ana', rol } })),
    login: vi.fn(),
  };
  const vistas: Documento[] = [];
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: (d) => vistas.push(d), alCambiar: vi.fn() });
  const servicios = crearServicios({
    base,
    sesion,
    cliente: cliente as never,
    motor,
    emitir: vi.fn(),
    elegirArchivo: async () => null,
    cola,
    listarImpresoras: async () => ['Termica 80', 'Microsoft Print to PDF'],
  });
  await servicios['sesion:elegirUsuario']({ usuarioId: 'u1', pin: '4321' });
  return { base, servicios, cola, vistas };
}

const texto = (d: Documento) => maquetar(d, 48).map((r) => r.texto).join('\n');
const muzza = { productoId: 'p1', seleccion: { g1: ['o1'] }, nota: '', cantidad: 1 };

it('confirmar un pendiente imprime su comanda con quien atendió', async () => {
  const { servicios, cola, vistas } = await armar();
  await servicios['salon:confirmar']({ pedidoId: 'q1' });
  await cola.esperar();
  expect(vistas).toHaveLength(1);
  expect(vistas[0]!.titulo).toBe('Comanda Cocina · Pedido 1');
  expect(texto(vistas[0]!)).toContain('Atendió: Ana');
  expect(texto(vistas[0]!)).toContain('» sin aceitunas');
});

it('un pedido de mostrador imprime sus comandas al crearse', async () => {
  const { servicios, cola, vistas } = await armar();
  await servicios['salon:crearPedido']({ origen: 'mostrador', items: [muzza] });
  await cola.esperar();
  expect(texto(vistas[0]!)).toContain('MOSTRADOR');
});

it('reimprimir marca la comanda', async () => {
  const { servicios, cola, vistas } = await armar();
  const { pedidoId } = await servicios['salon:crearPedido']({ origen: 'manual', sesionId: 's1', items: [muzza] });
  await servicios['impresion:reimprimir']({ pedidoId });
  await cola.esperar();
  expect(vistas.map((v) => v.titulo)).toEqual(['Comanda Cocina · Pedido 1', 'Comanda Cocina · Pedido 1 (reimpresión)']);
  expect(texto(vistas[1]!)).toContain('*** REIMPRESIÓN ***');
});

it('no se reimprime un pedido pendiente', async () => {
  const { servicios } = await armar();
  await expect(servicios['impresion:reimprimir']({ pedidoId: 'q1' })).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
});

it('la cuenta de una mesa suma solo lo confirmado', async () => {
  const { servicios, cola, vistas } = await armar();
  await servicios['salon:crearPedido']({ origen: 'manual', sesionId: 's1', items: [{ ...muzza, cantidad: 2 }] });
  await servicios['impresion:cuenta']({ sesionId: 's1' });
  await cola.esperar();
  const cuenta = vistas.find((v) => v.titulo === 'Cuenta Mesa 1')!;
  expect(texto(cuenta)).toMatch(/TOTAL\s+\$ 28\.000/);
  expect(texto(cuenta)).not.toContain('sin aceitunas');
});

it('la configuración lista las impresoras de Windows', async () => {
  const { servicios } = await armar('dueno');
  expect(await servicios['impresion:config']()).toMatchObject({ modo: 'vista_previa', impresoras: ['Termica 80', 'Microsoft Print to PDF'] });
  await servicios['impresion:guardarConfig']({ modo: 'impresora', impresora: 'Termica 80', columnas: 48 });
  expect(await servicios['impresion:config']()).toMatchObject({ modo: 'impresora', impresora: 'Termica 80' });
});

it('un mesero no puede cambiar la impresora', async () => {
  const { servicios } = await armar('mesero');
  await expect(
    servicios['impresion:guardarConfig']({ modo: 'impresora', impresora: 'X', columnas: 48 }),
  ).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
});

it('si la impresión falla al encolar, el pedido igual queda confirmado', async () => {
  const { servicios, cola } = await armar();
  vi.spyOn(cola, 'encolar').mockImplementation(() => {
    throw new Error('disco lleno');
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await servicios['salon:confirmar']({ pedidoId: 'q1' })).toEqual({ numero: 1 });
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});
