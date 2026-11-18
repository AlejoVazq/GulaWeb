import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { contarPendientes, encolar, pendientes } from '../src/main/db/outbox';
import { crearMotor, type EstadoSync } from '../src/main/sync/motor';
import { SinConexion } from '../src/main/api/cliente';
import { carpetaTemporal } from './tmp';
import { pullDePrueba } from './fixtures';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
beforeEach(() => {
  base = abrirBase(tmp.ruta(`m${n++}.db`));
});

type Respuesta = (ruta: string, cuerpo?: unknown) => unknown;
function clienteFalso(responder: Respuesta) {
  return {
    pedir: async <T>(_m: string, ruta: string, cuerpo?: unknown) => responder(ruta, cuerpo) as T,
    tokenActual: () => 'token',
    url: (r: string) => `http://api${r}`,
  };
}
const sinSocket = () => ({ on: () => {}, close: () => {} });

it('sin conexión: estado sin-conexion y la operación sigue pendiente', async () => {
  encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  const motor = crearMotor({ base, cliente: clienteFalso(() => { throw new SinConexion(); }), crearSocket: sinSocket });
  await motor.sincronizarAhora();
  expect(motor.estado()).toMatchObject({ conexion: 'sin-conexion', pendientes: 1 });
  expect(pendientes(base)[0]!.intentos).toBe(1);
});

it('al volver la conexión envía y queda en línea', async () => {
  const op = encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId: 'p1', disponible: false } });
  let red = false;
  const estados: EstadoSync[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      if (!red) throw new SinConexion();
      if (ruta === '/sync/operaciones') return { resultados: [{ id: op.id, estado: 'aplicada' }] };
      return pullDePrueba();
    }),
  });
  motor.on('estado', (e) => estados.push(e));
  await motor.sincronizarAhora();
  red = true;
  await motor.sincronizarAhora();
  expect(contarPendientes(base)).toBe(0);
  expect(motor.estado()).toMatchObject({ conexion: 'en-linea', pendientes: 0 });
  expect(motor.estado().ultimaSync).not.toBeNull();
  expect(estados.map((e) => e.conexion)).toContain('sin-conexion');
});

it('una operación rechazada no se reintenta', async () => {
  const op = encolar(base, { tipo: 'x', datos: {} });
  let envios = 0;
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      if (ruta === '/sync/operaciones') {
        envios++;
        return { resultados: [{ id: op.id, estado: 'rechazada', error: { codigo: 'DATOS_INVALIDOS', mensaje: 'x' } }] };
      }
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(envios).toBe(1);
  expect(contarPendientes(base)).toBe(0);
});

it('el pull guarda el cursor y lo usa en el siguiente', async () => {
  const rutas: string[] = [];
  const motor = crearMotor({
    base,
    crearSocket: sinSocket,
    cliente: clienteFalso((ruta) => {
      rutas.push(ruta);
      return pullDePrueba();
    }),
  });
  await motor.sincronizarAhora();
  await motor.sincronizarAhora();
  expect(rutas).toEqual(['/sync/carta', `/sync/carta?desde=${encodeURIComponent(pullDePrueba().cursor)}`]);
});
