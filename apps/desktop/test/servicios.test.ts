import { describe, expect, it, vi } from 'vitest';
import type { Rol } from '@gula/shared';
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

function armar(pedir: (metodo: string, ruta: string, cuerpo?: unknown) => unknown, rol: Rol = 'dueno', red = { hay: true }) {
  base = abrirBase(tmp.ruta(`s${n++}.db`));
  aplicarCambiosCarta(base, pullDePrueba());
  const sesion = crearSesion(base, identidad);
  sesion.guardar({ accessToken: 'a', refreshToken: 'r', usuario: { id: 'u1', nombre: 'Ale', rol }, local, dispositivoId: 'd1' });
  const motor = { sincronizarAhora: vi.fn(async () => {}), reconectar: vi.fn(), iniciar: vi.fn(), detener: vi.fn(), estado: () => ({ conexion: red.hay ? ('en-linea' as const) : ('sin-conexion' as const), pendientes: 0, rechazadas: 0, ultimaSync: null, desfaseReloj: null }) };
  const cliente = {
    pedir: vi.fn(async (m: string, r: string, c?: unknown) => {
      if (!red.hay) throw new SinConexion();
      return pedir(m, r, c);
    }),
    pin: vi.fn(async (usuarioId: string, p: string) => {
      if (!red.hay) throw new SinConexion();
      if (p !== '4321') throw new ErrorApiCliente(401, 'PIN_INCORRECTO', 'PIN incorrecto.');
      const usuario = { id: usuarioId, nombre: 'Ana', rol };
      sesion.fijarTokens({ accessToken: 'b', usuario });
      return { accessToken: 'b', usuario };
    }),
    login: vi.fn(),
  };
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir: vi.fn(), elegirArchivo: async () => null });
  const entrar = () => servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' });
  return { servicios, cliente, motor, entrar, sesion };
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

describe('PIN sin conexión', () => {
  const usuarios = [
    { id: 'u2', nombre: 'Ana', rol: 'encargado' },
    { id: 'u3', nombre: 'Moza', rol: 'mesero' },
  ];
  const conRed = () => {
    const red = { hay: true };
    const a = armar((m, r) => (r === '/auth/usuarios' ? usuarios : {}), 'encargado', red);
    return { ...a, red };
  };

  it('tras entrar con red, sin red se bloquea y se vuelve a entrar con el mismo PIN', async () => {
    const { servicios, entrar, red } = conRed();
    await servicios['sesion:usuarios']();
    await entrar();
    red.hay = false;
    servicios.bloquearPorInactividad();
    expect(await servicios['sesion:estado']()).toMatchObject({ tipo: 'bloqueada' });
    expect((await servicios['sesion:usuarios']()).map((u) => u.id)).toEqual(['u2']);
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '0000' })).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
    const e = await servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' });
    expect(e).toMatchObject({ tipo: 'activa', usuario: { id: 'u2', nombre: 'Ana', rol: 'encargado' } });
  });

  it('un usuario que nunca entró en esta PC con red no puede entrar sin red', async () => {
    const { servicios, entrar, red } = conRed();
    await servicios['sesion:usuarios']();
    await entrar();
    red.hay = false;
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u3', pin: '4321' })).rejects.toMatchObject({
      codigo: 'SIN_CONEXION',
      mensaje: 'Ese usuario todavía no entró en esta PC con conexión.',
    });
  });

  it('un PIN rechazado con red borra el verificador local', async () => {
    const { servicios, entrar, red } = conRed();
    await servicios['sesion:usuarios']();
    await entrar();
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '0000' })).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
    red.hay = false;
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' })).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
  });

  it('cinco PIN equivocados sin red bloquean al usuario en la PC', async () => {
    const { servicios, entrar, red } = conRed();
    await servicios['sesion:usuarios']();
    await entrar();
    red.hay = false;
    for (let i = 0; i < 4; i++)
      await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '0000' })).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '0000' })).rejects.toMatchObject({
      codigo: 'PIN_BLOQUEADO',
      mensaje: 'Demasiados intentos. Esperá 5 minutos.',
    });
    await expect(servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' })).rejects.toMatchObject({ codigo: 'PIN_BLOQUEADO' });
  });

  it('operar sin red como otro usuario encola con su usuarioId y su rol', async () => {
    const red = { hay: true };
    const { servicios, cliente, sesion } = armar((m, r) => (r === '/auth/usuarios' ? usuarios : {}), 'encargado', red);
    await servicios['sesion:usuarios']();
    await servicios['sesion:elegirUsuario']({ usuarioId: 'u3', pin: '4321' }); // la moza
    cliente.pin.mockImplementationOnce(async (usuarioId: string) => {
      const usuario = { id: usuarioId, nombre: 'Ana', rol: 'encargado' as Rol };
      sesion.fijarTokens({ accessToken: 'c', usuario });
      return { accessToken: 'c', usuario };
    });
    await servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' }); // el encargado
    red.hay = false;
    await servicios['sesion:bloquear']();
    const e = await servicios['sesion:elegirUsuario']({ usuarioId: 'u3', pin: '4321' });
    expect(e).toMatchObject({ tipo: 'activa', usuario: { id: 'u3', rol: 'mesero' } });
    await servicios['carta:disponibilidad']({ productoId: 'p1', disponible: false });
    expect(pendientes(base).at(-1)).toMatchObject({ usuarioId: 'u3' });
  });
});

describe('al volver la red, el usuario que entró sin conexión obtiene su propio token', () => {
  const usuarios = [
    { id: 'u2', nombre: 'Dueña', rol: 'dueno' },
    { id: 'u3', nombre: 'Enc', rol: 'encargado' },
  ];
  async function encargadoOffline() {
    const red = { hay: true };
    const a = armar((m, r) => (r === '/auth/usuarios' ? usuarios : { ok: true }), 'dueno', red);
    await a.servicios['sesion:usuarios']();
    await a.servicios['sesion:elegirUsuario']({ usuarioId: 'u3', pin: '4321' }); // deja el verificador del encargado
    await a.servicios['sesion:elegirUsuario']({ usuarioId: 'u2', pin: '4321' }); // el token queda de la dueña
    red.hay = false;
    await a.servicios['sesion:bloquear']();
    await a.servicios['sesion:elegirUsuario']({ usuarioId: 'u3', pin: '4321' });
    red.hay = true;
    a.cliente.pin.mockClear();
    a.cliente.pedir.mockClear();
    return a;
  }

  it('antes de pedir un reporte se renueva el token con el PIN del encargado', async () => {
    const { servicios, cliente } = await encargadoOffline();
    await servicios['reportes:obtener']({ tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' } as never).catch(() => undefined);
    expect(cliente.pin).toHaveBeenCalledWith('u3', '4321');
    expect(cliente.pin.mock.invocationCallOrder[0]!).toBeLessThan(cliente.pedir.mock.invocationCallOrder[0]!);
    expect(await servicios['sesion:estado']()).toMatchObject({ tipo: 'activa', usuario: { id: 'u3' } });
  });

  it('si el PIN cambió en el servidor, la PC se bloquea y no se pide nada con el token ajeno', async () => {
    const { servicios, cliente } = await encargadoOffline();
    cliente.pin.mockRejectedValueOnce(new ErrorApiCliente(401, 'PIN_INCORRECTO', 'PIN incorrecto.'));
    await expect(servicios['carta:editar']({ tipo: 'borrarProducto', id: 'p1' })).rejects.toMatchObject({ codigo: 'SESION_BLOQUEADA' });
    expect(cliente.pedir).not.toHaveBeenCalled();
    expect(await servicios['sesion:estado']()).toMatchObject({ tipo: 'bloqueada' });
  });

  it('sin red sigue diciendo que hace falta conexión', async () => {
    const { servicios, cliente } = await encargadoOffline();
    cliente.pin.mockRejectedValueOnce(new SinConexion());
    await expect(servicios['carta:editar']({ tipo: 'borrarProducto', id: 'p1' })).rejects.toMatchObject({
      codigo: 'SIN_CONEXION',
      mensaje: 'Necesitás conexión para editar la carta.',
    });
  });
});
