import { expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta } from '../src/main/db/carta';
import { aplicarCambiosSalon } from '../src/main/db/salon';
import { pendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { ErrorApiCliente, SinConexion } from '../src/main/api/cliente';
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

type Pedir = (metodo: string, ruta: string, cuerpo?: unknown) => Promise<unknown>;
async function armar(rol: 'dueno' | 'mesero' = 'dueno', pedir: Pedir = async () => undefined) {
  const base: BaseLocal = abrirBase(tmp.ruta(`sc${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  aplicarCambiosSalon(base, {
    cursor: T0,
    mesas: [{ id: 'm1', nombre: 'Mesa 1', zona: null, capacidad: null, orden: 0, token: 't', ...meta }],
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
    estado: () => ({ conexion: 'sin-conexion' as const, pendientes: 0, rechazadas: 0, ultimaSync: null }),
  };
  const cliente = {
    pedir: vi.fn(pedir),
    pin: vi.fn(async () => ({ accessToken: 'b', usuario: { id: 'u1', nombre: 'Ana', rol } })),
    login: vi.fn(),
  };
  const vistas: Documento[] = [];
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: (d) => vistas.push(d), alCambiar: vi.fn() });
  const emitir = vi.fn();
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir, elegirArchivo: async () => null, cola });
  await servicios['sesion:elegirUsuario']({ usuarioId: 'u1', pin: '1' });
  return { base, servicios, cola, vistas, cliente, emitir };
}

const muzza = (cantidad = 1) => ({ productoId: 'p1', seleccion: { g1: ['o1'] }, nota: '', cantidad }); // $ 14.000 c/u
async function mesaConPedido(s: Awaited<ReturnType<typeof armar>>['servicios'], cantidad = 1) {
  const { sesionId } = await s['salon:abrirMesa']({ mesaId: 'm1' });
  const p = await s['salon:crearPedido']({ origen: 'manual', sesionId, items: [muzza(cantidad)] });
  return { sesionId, ...p };
}
const tipos = (base: BaseLocal) => pendientes(base).map((o) => o.tipo);

it('sin caja abierta no se cobra', async () => {
  const { servicios } = await armar();
  const { sesionId } = await mesaConPedido(servicios);
  await expect(
    servicios['caja:cobrar']({ destino: { sesionId }, pagos: [{ metodo: 'efectivo', monto: 1400000, propina: 0 }] }),
  ).rejects.toMatchObject({ codigo: 'CAJA_CERRADA' });
});

it('pagos que no suman el total no se cobran ni se encolan', async () => {
  const { servicios, base } = await armar();
  await servicios['caja:abrir']({ fondo: 1000000 });
  const { sesionId } = await mesaConPedido(servicios);
  const antes = pendientes(base).length;
  await expect(
    servicios['caja:cobrar']({ destino: { sesionId }, pagos: [{ metodo: 'efectivo', monto: 1000000, propina: 0 }] }),
  ).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  expect(pendientes(base)).toHaveLength(antes);
});

it('cobrar la mesa la cierra y encola el cobro con el subtotal', async () => {
  const { servicios, base } = await armar();
  await servicios['caja:abrir']({ fondo: 1000000 });
  const { sesionId } = await mesaConPedido(servicios, 2);
  const r = await servicios['caja:cobrar']({
    destino: { sesionId },
    descuento: { tipo: 'porcentaje', valor: 10, motivo: 'Habitué' },
    pagos: [
      { metodo: 'efectivo', monto: 1520000, propina: 200000 },
      { metodo: 'debito', monto: 1000000, propina: 0 },
    ],
  });
  expect(r.total).toBe(2520000);
  expect((await servicios['salon:leer']()).mesas[0]!.sesion).toBeNull();
  const op = pendientes(base).find((o) => o.tipo === 'cuenta.cobrar')!;
  expect(op.datos).toMatchObject({ sesionId, subtotal: 2800000, descuento: { monto: 280000, motivo: 'Habitué' } });
  const { pedidoId } = (await servicios['salon:leer']()) && (pendientes(base).find((o) => o.tipo === 'pedido.crear')!.datos as { pedidoId: string });
  expect((op.datos as { pedidoIds: string[] }).pedidoIds).toEqual([pedidoId]);
  const caja = await servicios['caja:leer']();
  expect(caja.resumen!.porMetodo.efectivo).toEqual({ ventas: 1520000, propinas: 200000 });
});

it('cobrar dos veces la misma mesa: la segunda falla', async () => {
  const { servicios, base } = await armar();
  await servicios['caja:abrir']({ fondo: 0 });
  const { sesionId } = await mesaConPedido(servicios);
  const datos = { destino: { sesionId }, pagos: [{ metodo: 'efectivo' as const, monto: 1400000, propina: 0 }] };
  await servicios['caja:cobrar'](datos);
  await expect(servicios['caja:cobrar'](datos)).rejects.toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  expect(tipos(base).filter((t) => t === 'cuenta.cobrar')).toHaveLength(1);
});

it('un pedido de mostrador aparece por cobrar y se cobra', async () => {
  const { servicios } = await armar();
  await servicios['caja:abrir']({ fondo: 0 });
  const { pedidoId } = await servicios['salon:crearPedido']({ origen: 'mostrador', items: [muzza()] });
  expect((await servicios['caja:leer']()).porCobrar.map((p) => p.id)).toEqual([pedidoId]);
  await servicios['caja:cobrar']({ destino: { pedidoId }, pagos: [{ metodo: 'mercadopago', monto: 1400000, propina: 0 }] });
  expect((await servicios['caja:leer']()).porCobrar).toEqual([]);
});

it('no se cierra una mesa con pedidos sin cobrar', async () => {
  const { servicios } = await armar();
  const { sesionId } = await mesaConPedido(servicios);
  await expect(servicios['salon:cerrarMesa']({ sesionId })).rejects.toMatchObject({ codigo: 'CUENTA_PENDIENTE' });
});

it('una moza no anula sin autorización', async () => {
  const { servicios } = await armar('mesero');
  const { pedidoId } = await mesaConPedido(servicios);
  await expect(servicios['salon:anularPedido']({ pedidoId, motivo: 'Error' })).rejects.toMatchObject({ codigo: 'REQUIERE_AUTORIZACION' });
});

it('con el PIN correcto del encargado anula, encola con la autorización e imprime la anulación', async () => {
  const { servicios, base, cliente, cola, vistas } = await armar('mesero', async () => ({ usuario: { id: 'enc', rol: 'encargado' } }));
  const { pedidoId } = await mesaConPedido(servicios);
  const item = (await servicios['salon:mesa']('m1'))!.pedidos[0]!.items[0]!;
  await servicios['salon:anularItem']({ itemId: item.id, motivo: 'Se equivocó', autorizacion: { usuarioId: 'enc', pin: '5555' } });
  expect(cliente.pedir).toHaveBeenCalledWith('POST', '/auth/autorizar', { usuarioId: 'enc', pin: '5555', accion: 'pedido.anular' });
  const op = pendientes(base).find((o) => o.tipo === 'item.anular')!;
  expect(op.datos).toMatchObject({ itemId: item.id, pedidoId, motivo: 'Se equivocó' });
  expect(op.autorizacion).toEqual({ usuarioId: 'enc', pin: '5555' });
  expect((await servicios['salon:mesa']('m1'))!.pedidos[0]!.estado).toBe('anulado');
  await cola.esperar();
  const anul = vistas.find((v) => v.titulo.startsWith('Anulación'))!;
  expect(maquetar(anul, 48).map((r) => r.texto).join('\n')).toContain('*** ANULADO ***');
});

it('con un PIN incorrecto (y conexión) la anulación falla enseguida', async () => {
  const { servicios, base } = await armar('mesero', async () => {
    throw new ErrorApiCliente(403, 'REQUIERE_AUTORIZACION', 'El PIN no es correcto.');
  });
  const { pedidoId } = await mesaConPedido(servicios);
  await expect(
    servicios['salon:anularPedido']({ pedidoId, motivo: 'Error', autorizacion: { usuarioId: 'enc', pin: '0000' } }),
  ).rejects.toMatchObject({ codigo: 'REQUIERE_AUTORIZACION', mensaje: 'El PIN no es correcto.' });
  expect(tipos(base)).not.toContain('pedido.anular');
});

it('sin conexión la anulación autorizada se encola igual (la verifica el servidor)', async () => {
  const { servicios, base } = await armar('mesero', async () => {
    throw new SinConexion();
  });
  const { pedidoId } = await mesaConPedido(servicios);
  await servicios['salon:anularPedido']({ pedidoId, motivo: 'Error', autorizacion: { usuarioId: 'enc', pin: '5555' } });
  expect(tipos(base)).toContain('pedido.anular');
});

it('cerrar la caja encola el cierre con lo contado e imprime el ticket de cierre', async () => {
  const { servicios, base, cola, vistas } = await armar();
  await servicios['caja:abrir']({ fondo: 1000000 });
  await servicios['caja:movimiento']({ tipo: 'egreso', categoria: 'proveedores', monto: 200000, motivo: 'Hielo' });
  const r = await servicios['caja:cerrar']({ contado: 750000 });
  expect(r).toEqual({ esperado: 800000, diferencia: -50000 });
  expect(pendientes(base).find((o) => o.tipo === 'caja.cerrar')!.datos).toMatchObject({ contado: 750000 });
  expect((await servicios['caja:leer']()).turno).toBeNull();
  await cola.esperar();
  const t = maquetar(vistas.find((v) => v.titulo.startsWith('Cierre de caja'))!, 48).map((x) => x.texto).join('\n');
  expect(t).toMatch(/Efectivo esperado\s+\$ 8\.000/);
  expect(t).toMatch(/Diferencia\s+-\$ 500/);
});

it('una moza no abre la caja', async () => {
  const { servicios } = await armar('mesero');
  await expect(servicios['caja:abrir']({ fondo: 0 })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
});

it('los autorizantes son encargados y dueños, y sin conexión salen de la copia guardada', async () => {
  let red = true;
  const { servicios } = await armar('mesero', async (_m, ruta) => {
    if (!red) throw new SinConexion();
    if (ruta === '/auth/usuarios')
      return [
        { id: 'a', nombre: 'Ana', rol: 'mesero' },
        { id: 'enc', nombre: 'Enc', rol: 'encargado' },
        { id: 'd', nombre: 'Dueña', rol: 'dueno' },
      ];
    return undefined;
  });
  expect((await servicios['sesion:autorizantes']()).map((u) => u.id)).toEqual(['enc', 'd']);
  red = false;
  expect((await servicios['sesion:autorizantes']()).map((u) => u.id)).toEqual(['enc', 'd']);
});
