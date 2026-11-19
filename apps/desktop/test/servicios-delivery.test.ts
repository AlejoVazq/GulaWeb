import { expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta } from '../src/main/db/carta';
import { pendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { crearServicios } from '../src/main/servicios';
import { crearColaImpresion } from '../src/main/impresion/cola';
import { maquetar, type Documento } from '../src/compartido/impresion';
import { carpetaTemporal } from './tmp';
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
const local = { id: 'l1', nombre: 'Bar Gula', slug: 'bar' };
let n = 0;

async function armar(rol: 'dueno' | 'encargado' | 'mesero' = 'mesero') {
  const base: BaseLocal = abrirBase(tmp.ruta(`sd${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  const sesion = crearSesion(base, identidad);
  sesion.guardar({ accessToken: 'a', refreshToken: 'r', usuario: { id: 'u1', nombre: 'Ana', rol }, local, dispositivoId: 'd1' });
  const motor = {
    sincronizarAhora: vi.fn(async () => {}),
    reconectar: vi.fn(),
    iniciar: vi.fn(),
    detener: vi.fn(),
    estado: () => ({ conexion: 'sin-conexion' as const, pendientes: 0, rechazadas: 0, ultimaSync: null }),
  };
  const cliente = { pedir: vi.fn(), pin: vi.fn(async () => ({ accessToken: 'b', usuario: { id: 'u1', nombre: 'Ana', rol } })), login: vi.fn() };
  const vistas: Documento[] = [];
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: (d) => vistas.push(d), alCambiar: vi.fn() });
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir: vi.fn(), elegirArchivo: async () => null, cola });
  await servicios['sesion:elegirUsuario']({ usuarioId: 'u1', pin: '1' });
  return { base, servicios, cola, vistas };
}

const muzza = { productoId: 'p1', seleccion: { g1: ['o1'] }, nota: '', cantidad: 1 }; // $ 14.000
const cliente = { nombre: 'Juana\u001b Pérez', telefono: ' 1155551234 ', direccion: 'Av. Siempreviva 742', referencias: '' };
const nuevo = (s: Awaited<ReturnType<typeof armar>>['servicios'], extra: object = {}) =>
  s['delivery:crear']({ cliente, costoEnvio: 150000, pagaCon: 2000000, items: [muzza], ...extra });
const texto = (d: Documento) => maquetar(d, 48).map((r) => r.texto).join('\n');

it('crear encola delivery.crear con el cliente limpio e imprime comanda y ticket', async () => {
  const { base, servicios, cola, vistas } = await armar();
  const { pedidoId, numero } = await nuevo(servicios);
  expect(numero).toBe(1);
  const [op] = pendientes(base);
  expect(op).toMatchObject({
    tipo: 'delivery.crear',
    datos: { pedidoId, numero: 1, costoEnvio: 150000, pagaCon: 2000000, cliente: { nombre: 'Juana Pérez', telefono: '1155551234' } },
  });
  await cola.esperar();
  expect(vistas.map((v) => v.titulo)).toEqual(['Comanda Cocina · Pedido 1', 'Delivery · Pedido 1']);
  expect(texto(vistas[0]!)).toContain('DELIVERY');
  const t = await servicios['delivery:tablero']();
  expect(t.preparando[0]).toMatchObject({ id: pedidoId, aCobrar: 1550000 });
});

it('paga con menos que el total o sin dirección no se crea', async () => {
  const { base, servicios } = await armar();
  await expect(nuevo(servicios, { pagaCon: 1000000 })).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS', mensaje: 'Paga con menos que el total.' });
  await expect(nuevo(servicios, { cliente: { ...cliente, direccion: '  ' } })).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  await expect(nuevo(servicios, { costoEnvio: -1 })).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  expect(pendientes(base)).toEqual([]);
});

it('el reparto avanza una vez; entregar pide cobrar antes', async () => {
  const { base, servicios } = await armar();
  const { pedidoId } = await nuevo(servicios);
  await servicios['delivery:estado']({ pedidoId, estado: 'en_camino', repartidor: 'Juan' });
  await expect(servicios['delivery:estado']({ pedidoId, estado: 'en_camino' })).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  await expect(servicios['delivery:estado']({ pedidoId, estado: 'entregado' })).rejects.toMatchObject({ codigo: 'CUENTA_PENDIENTE' });
  expect(pendientes(base).map((o) => o.tipo)).toEqual(['delivery.crear', 'delivery.estado']);
  expect(pendientes(base)[1]!.datos).toEqual({ pedidoId, estado: 'en_camino', repartidor: 'Juan' });
});

it('cobrar un delivery suma el envío y después se entrega', async () => {
  const { base, servicios } = await armar('encargado');
  await servicios['caja:abrir']({ fondo: 0 });
  const { pedidoId } = await nuevo(servicios);
  await expect(
    servicios['caja:cobrar']({ destino: { pedidoId }, pagos: [{ metodo: 'efectivo', monto: 1400000, propina: 0 }] }),
  ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  await servicios['caja:cobrar']({ destino: { pedidoId }, pagos: [{ metodo: 'efectivo', monto: 1550000, propina: 0 }] });
  expect(pendientes(base).find((o) => o.tipo === 'cuenta.cobrar')!.datos).toMatchObject({ pedidoId, subtotal: 1550000 });
  await servicios['delivery:estado']({ pedidoId, estado: 'entregado' });
  const t = await servicios['delivery:tablero']();
  expect(t.entregados.map((p) => p.id)).toEqual([pedidoId]);
});

it('un delivery anulado no avanza y no se cobra', async () => {
  const { servicios } = await armar('encargado');
  await servicios['caja:abrir']({ fondo: 0 });
  const { pedidoId } = await nuevo(servicios);
  await servicios['salon:anularPedido']({ pedidoId, motivo: 'Canceló' });
  await expect(servicios['delivery:estado']({ pedidoId, estado: 'en_camino' })).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  await expect(
    servicios['caja:cobrar']({ destino: { pedidoId }, pagos: [{ metodo: 'efectivo', monto: 1550000, propina: 0 }] }),
  ).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  expect((await servicios['delivery:tablero']()).cancelados.map((p) => p.id)).toEqual([pedidoId]);
});

it('busca el cliente por teléfono', async () => {
  const { servicios } = await armar();
  await nuevo(servicios);
  expect(await servicios['delivery:cliente']({ telefono: '1155551234' })).toMatchObject({ direccion: 'Av. Siempreviva 742' });
});

it('el envío por defecto lo cambia solo el dueño', async () => {
  const m = await armar('mesero');
  expect(await m.servicios['delivery:config']()).toEqual({ envio: 0 });
  await expect(m.servicios['delivery:guardarConfig']({ envio: 150000 })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
  const d = await armar('dueno');
  await d.servicios['delivery:guardarConfig']({ envio: 150000 });
  expect(await d.servicios['delivery:config']()).toEqual({ envio: 150000 });
});
