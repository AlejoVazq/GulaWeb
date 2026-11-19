import { expect, it, vi } from 'vitest';
import { abrirBase } from '../src/main/db/base';
import { crearSesion } from '../src/main/api/sesion';
import { SinConexion } from '../src/main/api/cliente';
import { crearServicios } from '../src/main/servicios';
import { crearColaImpresion } from '../src/main/impresion/cola';
import type { RespuestaReporte } from '../src/compartido/reportes';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
let n = 0;
const vacio = { ventas: 0, cobros: 0, ticketPromedio: 0, propinas: 0, descuentos: 0, envios: 0, porMetodo: [], porOrigen: [], porHora: [], productos: [], meseros: [] };
const respuesta: RespuestaReporte = {
  rango: { desde: '2026-11-01', hasta: '2026-11-30' },
  rangoAnterior: { desde: '2026-10-01', hasta: '2026-10-31' },
  actual: { ...vacio, ventas: 1500000 },
  anterior: vacio,
};

async function armar(rol: 'dueno' | 'mesero' = 'dueno', pedir: (...a: unknown[]) => Promise<unknown> = async () => respuesta) {
  const base = abrirBase(tmp.ruta(`sr${n++}.db`));
  const sesion = crearSesion(base, identidad);
  sesion.guardar({ accessToken: 'a', refreshToken: 'r', usuario: { id: 'u1', nombre: 'Ana', rol }, local: { id: 'l1', nombre: 'Bar Gula', slug: 'bar' }, dispositivoId: 'd1' });
  const motor = { sincronizarAhora: vi.fn(async () => {}), reconectar: vi.fn(), iniciar: vi.fn(), detener: vi.fn(), estado: () => ({ conexion: 'en-linea' as const, pendientes: 0, rechazadas: 0, ultimaSync: null, desfaseReloj: null }) };
  const cliente = { pedir: vi.fn(pedir), pin: vi.fn(async () => ({ accessToken: 'b', usuario: { id: 'u1', nombre: 'Ana', rol } })), login: vi.fn() };
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  const guardarArchivo = vi.fn(async (_nombre: string, _datos: Uint8Array | string) => true);
  const htmlAPdf = vi.fn(async (_html: string) => new Uint8Array([37, 80, 68, 70]));
  const servicios = crearServicios({ base, sesion, cliente: cliente as never, motor, emitir: vi.fn(), elegirArchivo: async () => null, cola, guardarArchivo, htmlAPdf });
  await servicios['sesion:elegirUsuario']({ usuarioId: 'u1', pin: '1' });
  return { servicios, cliente, guardarArchivo, htmlAPdf };
}

it('pide el reporte al servidor con el tipo de período', async () => {
  const { servicios, cliente } = await armar();
  expect(await servicios['reportes:obtener']({ tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' })).toEqual(respuesta);
  expect(cliente.pedir).toHaveBeenLastCalledWith('GET', '/reportes?tipo=mes&desde=2026-11-01&hasta=2026-11-30');
});

it('sin conexión avisa que los reportes la necesitan; un mesero no puede verlos', async () => {
  const { servicios } = await armar('dueno', async () => {
    throw new SinConexion();
  });
  await expect(servicios['reportes:obtener']({ tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' })).rejects.toMatchObject({
    codigo: 'SIN_CONEXION',
    mensaje: 'Los reportes necesitan conexión.',
  });
  const m = await armar('mesero');
  await expect(m.servicios['reportes:obtener']({ tipo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' })).rejects.toMatchObject({ codigo: 'SIN_PERMISO' });
});

it('rango inválido no llega al servidor', async () => {
  const { servicios, cliente } = await armar();
  await expect(servicios['reportes:obtener']({ tipo: 'personalizado', desde: '2026-11-10', hasta: '2026-11-01' })).rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
  expect(cliente.pedir).not.toHaveBeenCalledWith('GET', expect.stringContaining('/reportes'));
});

it('exporta CSV y PDF con nombre sugerido', async () => {
  const { servicios, guardarArchivo, htmlAPdf } = await armar();
  expect(await servicios['reportes:exportar']({ formato: 'csv', reporte: respuesta })).toBe(true);
  expect(guardarArchivo).toHaveBeenLastCalledWith('reporte-2026-11-01-a-2026-11-30.csv', expect.stringContaining('Ventas;15000,00'));
  await servicios['reportes:exportar']({ formato: 'pdf', reporte: respuesta });
  expect(htmlAPdf.mock.calls[0]![0]).toContain('Reporte · Bar Gula');
  expect(guardarArchivo).toHaveBeenLastCalledWith('reporte-2026-11-01-a-2026-11-30.pdf', new Uint8Array([37, 80, 68, 70]));
});
