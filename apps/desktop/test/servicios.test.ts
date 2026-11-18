import { expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosCarta, leerCarta } from '../src/main/db/carta';
import { pendientes } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { ErrorApiCliente, SinConexion } from '../src/main/api/cliente';
import { crearServicios } from '../src/main/servicios';
import { carpetaTemporal } from './tmp';
import { escribirKv, leerKv } from '../src/main/db/kv';

const sesionDe = (b: BaseLocal) => crearSesion(b, { cifrar: (t: string) => t, descifrar: (t: string) => t });
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
let base: BaseLocal;
let n = 0;
const local = { id: 'l1', nombre: 'Bar', slug: 'bar' };

function armar(pedir: (metodo: string, ruta: string, cuerpo?: unknown) => unknown, rol: 'dueno' | 'mesero' = 'dueno') {
  base = abrirBase(tmp.ruta(`s${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  const sesion = crearSesion(base, identidad);
  sesion.guardar({ accessToken: 'a', refreshToken: 'r', usuario: { id: 'u1', nombre: 'Ale', rol }, local, dispositivoId: 'd1' });
  const motor = { sincronizarAhora: vi.fn(async () => {}), reconectar: vi.fn(), iniciar: vi.fn(), detener: vi.fn(), estado: () => ({ conexion: 'en-linea' as const, pendientes: 0, rechazadas: 0, ultimaSync: null }) };
  const cliente = {
    pedir: vi.fn(async (m: string, r: string, c?: unknown) => pedir(m, r, c)),
    pin: vi.fn(async (usuarioId: string, p: string) => {
      if (p !== '4321') throw new ErrorApiCliente(401, 'PIN_INCORRECTO', 'PIN incorrecto.');
      const usuario = { id: usuarioId, nombre: 'Ana', rol };
      sesion.fijarTokens({ accessToken: 'b', usuario });
      return { accessToken: 'b', usuario };
    }),
    login: vi.fn(),
  };
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir: vi.fn(), elegirArchivo: async () => null });
  const entrar = () => servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' });
  return { servicios, cliente, motor, entrar };
}

it('estando bloqueada no se puede operar', async () => {
  const { servicios } = armar(() => ({}));
  await expect(servicios['carta:disponibilidad']({ productoId: 'p1', disponible: false })).rejects.toMatchObject({ codigo: 'SESION_BLOQUEADA' });
});

it('PIN incorrecto devuelve el código de la API', async () => {
  const { servicios } = armar(() => ({}));
  await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '0000' })).rejects.toMatchObject({
    codigo: 'PIN_INCORRECTO',
  });
});

it('PIN correcto desbloquea con el nuevo usuario', async () => {
  const { servicios, motor } = armar(() => ({}), 'mesero');
  expect(await servicios['sesion:estado']()).toEqual({ tipo: 'bloqueada', local });
  const e = await servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' });
  expect(e).toMatchObject({ tipo: 'activa', usuario: { id: 'u2', rol: 'mesero' } });
  expect(motor.reconectar).toHaveBeenCalled();
});

it('disponibilidad encola en la outbox y actualiza la carta local antes de responder', async () => {
  const { servicios, motor, entrar } = armar(() => ({}), 'mesero');
  await entrar();
  await servicios['carta:disponibilidad']({ productoId: 'p1', disponible: false });
  expect(leerCarta(base).categorias[0]!.productos[0]!.disponible).toBe(false);
  expect(pendientes(base)).toEqual([
    expect.objectContaining({ tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false }, usuarioId: 'u2' }),
  ]);
  expect(motor.sincronizarAhora).toHaveBeenCalled();
});

it('edición online sin conexión devuelve SIN_CONEXION con mensaje claro', async () => {
  const { servicios, entrar } = armar(() => {
    throw new SinConexion();
  });
  await entrar();
  await expect(servicios['carta:editar']({ tipo: 'borrarProducto', id: 'p1' })).rejects.toMatchObject({
    codigo: 'SIN_CONEXION',
    mensaje: 'Necesitás conexión para editar la carta.',
  });
});

it('edición online se traduce a REST y dispara sincronización', async () => {
  const { servicios, cliente, motor, entrar } = armar(() => ({}));
  await entrar();
  await servicios['carta:editar']({ tipo: 'editarProducto', id: 'p1', datos: { precio: 1500000 } });
  expect(cliente.pedir).toHaveBeenCalledWith('PATCH', '/carta/productos/p1', { precio: 1500000 });
  expect(motor.sincronizarAhora).toHaveBeenCalled();
});

it('la moza no puede editar la carta', async () => {
  const { servicios, entrar } = armar(() => ({}), 'mesero');
  await entrar();
  await expect(servicios['carta:editar']({ tipo: 'borrarProducto', id: 'p1' })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
});

it('vincular la PC a otro local borra la carta, el cursor y la outbox del anterior', async () => {
  const { servicios, cliente, entrar } = armar(() => ({}), 'mesero');
  await entrar();
  await servicios['carta:disponibilidad']({ productoId: 'p1', disponible: false });
  escribirKv(base, 'cursor:carta', '2026-11-18T10:00:00.000Z');
  cliente.login.mockImplementation(async () => {
    sesionDe(base).guardar({ accessToken: 'x', refreshToken: 'y', usuario: { id: 'z', nombre: 'Otro', rol: 'dueno' }, local: { id: 'l2', nombre: 'Otro bar', slug: 'otro' }, dispositivoId: 'd2' });
  });
  await servicios['sesion:login']({ email: 'o@o.com', password: 'secreto123', nombrePc: 'PC' });
  expect(leerCarta(base).categorias).toEqual([]);
  expect(pendientes(base)).toEqual([]);
  expect(leerKv(base, 'cursor:carta')).toBeNull();
});

it('volver a vincular al mismo local conserva los datos', async () => {
  const { servicios, cliente } = armar(() => ({}));
  cliente.login.mockImplementation(async () => {
    sesionDe(base).guardar({ accessToken: 'x', refreshToken: 'y', usuario: { id: 'u1', nombre: 'Ale', rol: 'dueno' }, local, dispositivoId: 'd3' });
  });
  await servicios['sesion:login']({ email: 'a@a.com', password: 'secreto123', nombrePc: 'PC' });
  expect(leerCarta(base).categorias).toHaveLength(1);
});
