import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';
import { auditoria } from '../../api/src/db/schema/index';
import { appDePrueba, escenario, pedir, type Escenario } from '../../api/test/app';
import { dbs, limpiarDb } from '../../api/test/db';
import { migrar } from '../../api/src/db/migrar';
import { envValido } from '../../api/test/helpers';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { leerCarta } from '../src/main/db/carta';
import { encolar } from '../src/main/db/outbox';
import { crearSesion } from '../src/main/api/sesion';
import { crearCliente } from '../src/main/api/cliente';
import { crearMotor } from '../src/main/sync/motor';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
const identidad = { cifrar: (t: string) => t, descifrar: (t: string) => t };
let app: Awaited<ReturnType<typeof appDePrueba>>;
let e: Escenario;
let base: BaseLocal;
let url: string;
let productoId: string;
let n = 0;

beforeEach(async () => {
  await migrar(envValido.DATABASE_ADMIN_URL);
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
  const enc = pedir(app, e.tokenEncargado);
  const cat = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json();
  productoId = (await enc('POST', '/carta/productos', { categoriaId: cat.id, nombre: 'Muzzarella', precio: 1200000 })).json().id;
  await app.listen({ port: 0, host: '127.0.0.1' });
  const dir = app.server.address();
  url = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
  base = abrirBase(tmp.ruta(`i${n++}.db`));
});
afterEach(async () => {
  base.cerrar();
  await app.close();
});
afterAll(() => dbs.cerrar());

async function motorLogueado() {
  const sesion = crearSesion(base, identidad);
  const cliente = crearCliente({ urlBase: url, sesion });
  // la escena ya tiene una PC logueada; esta es "la PC" de la prueba
  await cliente.login('dueno@local.com', 'secreto123', 'PC prueba');
  return { cliente, motor: crearMotor({ base, cliente, crearSocket: () => ({ on: () => {}, close: () => {} }) }) };
}

it('una operación reenviada (respuesta perdida) se aplica una sola vez', async () => {
  const { cliente, motor } = await motorLogueado();
  const op = encolar(base, { tipo: 'producto.disponibilidad', datos: { productoId, disponible: false } });
  const lote = { operaciones: [{ id: op.id, tipo: op.tipo, datos: op.datos, creadaEn: op.creadaEn }] };
  await cliente.pedir('POST', '/sync/operaciones', lote); // primer envío cuya respuesta "se perdió"
  await motor.sincronizarAhora(); // el motor la reenvía
  const filas = await dbs.dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'producto.disponibilidad'));
  expect(filas).toHaveLength(1);
  expect(leerCarta(base).categorias[0]!.productos[0]!.disponible).toBe(false);
});

it('cambios hechos en el servidor durante el corte llegan al reconectar', async () => {
  const { motor, cliente } = await motorLogueado();
  await motor.sincronizarAhora();
  expect(leerCarta(base).categorias[0]!.productos[0]!.precio).toBe(1200000);
  // el login de la PC de prueba desactivó la PC del escenario: se edita con el cliente de la prueba
  await cliente.pedir('PATCH', `/carta/productos/${productoId}`, { precio: 1350000 });
  const otro = await cliente.pedir<{ id: string }>('POST', '/carta/productos', { categoriaId: leerCarta(base).categorias[0]!.id, nombre: 'Fugazzeta', precio: 1 });
  await cliente.pedir('DELETE', `/carta/productos/${otro.id}`);
  await motor.sincronizarAhora();
  const productos = leerCarta(base).categorias[0]!.productos;
  expect(productos.map((p) => [p.nombre, p.precio])).toEqual([['Muzzarella', 1350000]]);
});
