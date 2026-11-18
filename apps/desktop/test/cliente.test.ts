import { beforeEach, expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { crearSesion, type Cifrador } from '../src/main/api/sesion';
import { crearCliente, ErrorApiCliente, SinConexion } from '../src/main/api/cliente';
import { leerKv } from '../src/main/db/kv';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
const rot13: Cifrador = {
  cifrar: (t) => Buffer.from(t).toString('base64').split('').reverse().join(''),
  descifrar: (t) => Buffer.from(t.split('').reverse().join(''), 'base64').toString(),
};
const json = (status: number, cuerpo: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const local = { id: 'l1', nombre: 'Bar', slug: 'bar' };
const usuario = { id: 'u1', nombre: 'Ale', rol: 'dueno' as const };

beforeEach(() => {
  base = abrirBase(tmp.ruta(`c${n++}.db`));
});

function preparar(fetchFalso: typeof fetch) {
  const sesion = crearSesion(base, rot13);
  sesion.guardar({ accessToken: 'viejo', refreshToken: 'r0', usuario, local, dispositivoId: 'd1' });
  const cliente = crearCliente({ urlBase: 'http://api', sesion, fetch: fetchFalso });
  return { sesion, cliente };
}

it('tres requests con token vencido disparan un solo refresh', async () => {
  let refreshes = 0;
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/auth/refresh')) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 20));
      return json(200, { accessToken: 'nuevo', refreshToken: 'r1' });
    }
    const auth = (init?.headers as Record<string, string>).authorization;
    return auth === 'Bearer nuevo' ? json(200, { ok: u }) : json(401, { error: { codigo: 'SESION_INVALIDA', mensaje: 'x' } });
  }) as unknown as typeof fetch;
  const { cliente, sesion } = preparar(f);
  const r = await Promise.all([cliente.pedir('GET', '/a'), cliente.pedir('GET', '/b'), cliente.pedir('GET', '/c')]);
  expect(r).toEqual([{ ok: 'http://api/a' }, { ok: 'http://api/b' }, { ok: 'http://api/c' }]);
  expect(refreshes).toBe(1);
  expect(sesion.actual()?.refreshToken).toBe('r1');
});

it('refresh rechazado borra la sesión y avisa', async () => {
  const f = (async (url: string | URL | Request) =>
    String(url).endsWith('/auth/refresh')
      ? json(401, { error: { codigo: 'TOKEN_REUTILIZADO', mensaje: 'x' } })
      : json(401, { error: { codigo: 'SESION_INVALIDA', mensaje: 'x' } })) as unknown as typeof fetch;
  const { cliente, sesion } = preparar(f);
  const cerrada = vi.fn();
  cliente.on('sesion-cerrada', cerrada);
  await expect(cliente.pedir('GET', '/a')).rejects.toMatchObject({ codigo: 'SESION_INVALIDA' });
  expect(sesion.actual()).toBeNull();
  expect(cerrada).toHaveBeenCalledOnce();
});

it('fallo de red lanza SinConexion', async () => {
  const f = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  const { cliente } = preparar(f);
  await expect(cliente.pedir('GET', '/a')).rejects.toBeInstanceOf(SinConexion);
});

it('errores de la API llegan con código y mensaje', async () => {
  const f = (async () => json(409, { error: { codigo: 'CATEGORIA_CON_PRODUCTOS', mensaje: 'Primero mové…' } })) as unknown as typeof fetch;
  const { cliente } = preparar(f);
  const e = await cliente.pedir('DELETE', '/carta/categorias/x').catch((x: unknown) => x);
  expect(e).toBeInstanceOf(ErrorApiCliente);
  expect(e).toMatchObject({ status: 409, codigo: 'CATEGORIA_CON_PRODUCTOS', mensaje: 'Primero mové…' });
});

it('el refresh se guarda cifrado', () => {
  const sesion = crearSesion(base, rot13);
  sesion.guardar({ accessToken: 'a', refreshToken: 'secreto-refresh', usuario, local, dispositivoId: 'd1' });
  expect(JSON.stringify(leerKv(base, 'sesion'))).not.toContain('secreto-refresh');
  expect(crearSesion(base, rot13).actual()?.refreshToken).toBe('secreto-refresh');
});
