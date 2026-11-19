import { expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta } from '../src/main/db/carta';
import { aplicarCambiosSalon, leerSalon } from '../src/main/db/salon';
import { pendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { crearServicios } from '../src/main/servicios';
import { carpetaTemporal } from './tmp';
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
const local = { id: 'l1', nombre: 'Bar', slug: 'bar' };
const T0 = '2026-11-18T20:00:00.000Z';
let n = 0;

async function armar(rol: 'dueno' | 'mesero' = 'mesero') {
  const base: BaseLocal = abrirBase(tmp.ruta(`ss${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  aplicarCambiosSalon(base, {
    cursor: T0,
    mesas: [{ id: 'm1', nombre: 'Mesa 1', zona: null, capacidad: null, orden: 0, token: 't', actualizadoEn: T0, eliminadoEn: null }],
    sesiones: [],
    pedidos: [],
    items: [],
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
  const emitir = vi.fn();
  const cliente = {
    pedir: vi.fn(),
    pin: vi.fn(async () => ({ accessToken: 'b', usuario: { id: 'u1', nombre: 'Ana', rol } })),
    login: vi.fn(),
  };
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir, elegirArchivo: async () => null });
  await servicios['sesion:elegirUsuario']({ usuarioId: 'u1', pin: '4321' });
  return { base, servicios, motor, emitir };
}

const muzzaGrande = { productoId: 'p1', seleccion: { g1: ['o1'] }, nota: 'bien cocida', cantidad: 2 };

it('abrir mesa sin conexión queda en la outbox y la mesa se ve ocupada', async () => {
  const { base, servicios, emitir } = await armar();
  await servicios['salon:abrirMesa']({ mesaId: 'm1', comensales: 2 });
  const s = await servicios['salon:leer']();
  expect(s.mesas[0]!.sesion).toMatchObject({ estado: 'abierta', comensales: 2 });
  const [op] = pendientes(base);
  expect(op).toMatchObject({ tipo: 'mesa.abrir', datos: { mesaId: 'm1', comensales: 2, sesionId: s.mesas[0]!.sesion!.id }, usuarioId: 'u1' });
  expect(emitir).toHaveBeenCalledWith('salon:cambio', null);
});

it('abrir una mesa ya abierta falla sin encolar', async () => {
  const { base, servicios } = await armar();
  await servicios['salon:abrirMesa']({ mesaId: 'm1' });
  await expect(servicios['salon:abrirMesa']({ mesaId: 'm1' })).rejects.toMatchObject({ codigo: 'MESA_OCUPADA' });
  expect(pendientes(base)).toHaveLength(1);
});

it('un pedido manual sin conexión queda en la outbox, visible con número 1 y precios de la carta local', async () => {
  const { base, servicios, motor } = await armar();
  await servicios['salon:abrirMesa']({ mesaId: 'm1' });
  const sesionId = (await servicios['salon:leer']()).mesas[0]!.sesion!.id;
  await servicios['salon:crearPedido']({ origen: 'manual', sesionId, items: [muzzaGrande] });

  const d = await servicios['salon:mesa']('m1');
  expect(d!.pedidos).toHaveLength(1);
  expect(d!.pedidos[0]).toMatchObject({ estado: 'confirmado', numero: 1, total: 2800000 });
  expect(d!.pedidos[0]!.items[0]).toMatchObject({ nombre: 'Muzza', precioUnitario: 1400000, resumenOpciones: 'Grande', sectorId: 's1' });

  const op = pendientes(base)[1]!;
  expect(op.tipo).toBe('pedido.crear');
  expect(op.datos).toMatchObject({
    origen: 'manual',
    sesionId,
    numero: 1,
    items: [{ productoId: 'p1', precioUnitario: 1400000, cantidad: 2, nota: 'bien cocida', sectorId: 's1' }],
  });
  expect(motor.sincronizarAhora).toHaveBeenCalled();
});

it('un pedido con un grupo obligatorio sin elegir se rechaza', async () => {
  const { servicios } = await armar();
  await expect(
    servicios['salon:crearPedido']({ origen: 'mostrador', items: [{ ...muzzaGrande, seleccion: {} }] }),
  ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
});

it('confirmar un pendiente asigna el siguiente número del día', async () => {
  const { base, servicios } = await armar();
  await servicios['salon:crearPedido']({ origen: 'mostrador', items: [muzzaGrande] }); // número 1
  aplicarCambiosSalon(base, {
    cursor: T0,
    mesas: [],
    sesiones: [
      { id: 's1', mesaId: 'm1', estado: 'abierta', comensales: null, abiertaPor: null, abiertaEn: T0, cerradaPor: null, cerradaEn: null, actualizadoEn: T0, eliminadoEn: null },
    ],
    pedidos: [
      {
        id: 'q1', origen: 'qr', estado: 'pendiente', sesionId: 's1', mesaId: 'm1', numero: null, dia: null, notas: null,
        motivoRechazo: null, creadoPor: null, confirmadoPor: null, confirmadoEn: null, rechazadoEn: null, creadoEn: T0,
        actualizadoEn: T0, eliminadoEn: null,
      },
    ],
    items: [
      {
        id: 'qi1', pedidoId: 'q1', productoId: 'p1', nombre: 'Muzza', precioUnitario: 1200000, cantidad: 1, seleccion: {},
        resumenOpciones: '', nota: '', sectorId: null, anulado: false, creadoEn: T0, actualizadoEn: T0, eliminadoEn: null,
      },
    ],
    avisos: [],
  });
  expect((await servicios['salon:leer']()).pendientes).toHaveLength(1);
  await servicios['salon:confirmar']({ pedidoId: 'q1' });
  expect((await servicios['salon:leer']()).pendientes).toEqual([]);
  const op = pendientes(base).at(-1)!;
  expect(op).toMatchObject({ tipo: 'pedido.confirmar', datos: { pedidoId: 'q1', numero: 2 } });
  await expect(servicios['salon:confirmar']({ pedidoId: 'q1' })).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
});

it('rechazar exige motivo', async () => {
  const { servicios } = await armar();
  await expect(servicios['salon:rechazar']({ pedidoId: 'q1', motivo: '  ' })).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
});

it('cerrar la mesa encola y la libera', async () => {
  const { base, servicios } = await armar();
  await servicios['salon:abrirMesa']({ mesaId: 'm1' });
  const sesionId = (await servicios['salon:leer']()).mesas[0]!.sesion!.id;
  await servicios['salon:cerrarMesa']({ sesionId });
  expect(leerSalon(base).mesas[0]!.sesion).toBeNull();
  expect(pendientes(base).map((o) => o.tipo)).toEqual(['mesa.abrir', 'mesa.cerrar']);
});

it('estando bloqueada no se opera el salón', async () => {
  const { servicios } = await armar();
  await servicios['sesion:bloquear']();
  await expect(servicios['salon:abrirMesa']({ mesaId: 'm1' })).rejects.toMatchObject({ codigo: 'SESION_BLOQUEADA' });
});
