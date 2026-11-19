import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { auditoria, cobros, movimientosCaja, pagos, turnosCaja } from '../src/db/schema/index.js';
import { appDePrueba, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';
import { mesaDePrueba } from './salon.js';

let app: FastifyInstance;
let e: Escenario;
beforeEach(async () => {
  await limpiarDb();
  app = await appDePrueba();
  e = await escenario(app);
});
afterEach(() => app.close());
afterAll(() => dbs.cerrar());

const op = (tipo: string, datos: unknown) => ({ id: nuevoId(), tipo, datos, creadaEn: new Date().toISOString() });
async function enviar(token: string, ...operaciones: unknown[]) {
  const r = await pedir(app, token)('POST', '/sync/operaciones', { operaciones });
  return r.json().resultados as { estado: string; error?: { codigo: string } }[];
}
const leer = <T>(fn: Parameters<typeof conLocal<T>>[2]) => conLocal(dbs.dbApp, e.localId, fn);

it('no se abren dos cajas a la vez', async () => {
  const r = await enviar(
    e.tokenEncargado,
    op('caja.abrir', { turnoId: nuevoId(), fondo: 1000000 }),
    op('caja.abrir', { turnoId: nuevoId(), fondo: 0 }),
  );
  expect(r.map((x) => x.estado)).toEqual(['aplicada', 'rechazada']);
  expect(r[1]!.error!.codigo).toBe('CAJA_ABIERTA');
});

it('una moza no abre la caja', async () => {
  const [r] = await enviar(e.tokenMoza, op('caja.abrir', { turnoId: nuevoId(), fondo: 0 }));
  expect(r!.error!.codigo).toBe('SIN_PERMISO');
});

it('un movimiento en una caja cerrada se rechaza', async () => {
  const turnoId = nuevoId();
  await enviar(e.tokenEncargado, op('caja.abrir', { turnoId, fondo: 0 }), op('caja.cerrar', { turnoId, contado: 0 }));
  const [r] = await enviar(
    e.tokenEncargado,
    op('caja.movimiento', { movimientoId: nuevoId(), turnoId, tipo: 'egreso', categoria: 'proveedores', monto: 1000, motivo: 'Hielo' }),
  );
  expect(r!.error!.codigo).toBe('CAJA_CERRADA');
});

it('cerrar calcula el esperado y la diferencia, y queda auditado', async () => {
  const turnoId = nuevoId();
  await enviar(
    e.tokenEncargado,
    op('caja.abrir', { turnoId, fondo: 1000000 }),
    op('caja.movimiento', { movimientoId: nuevoId(), turnoId, tipo: 'egreso', categoria: 'proveedores', monto: 200000, motivo: 'Verdulería' }),
  );
  // Un cobro en efectivo de $ 5.000 (lo arma la operación de cobro; acá se inserta directo).
  const mesa = await mesaDePrueba(e.localId);
  await leer(async (tx) => {
    const cobroId = nuevoId();
    await tx.insert(cobros).values({
      id: cobroId, localId: e.localId, turnoId, sesionId: mesa.sesionId, subtotal: 500000, descuento: 0, total: 500000, cobradoPor: e.encId,
    });
    await tx.insert(pagos).values({ id: nuevoId(), localId: e.localId, cobroId, turnoId, metodo: 'efectivo', monto: 500000, propina: 0 });
  });
  const [r] = await enviar(e.tokenEncargado, op('caja.cerrar', { turnoId, contado: 1250000, notas: 'Faltó cambio' }));
  expect(r!.estado).toBe('aplicada');
  const [t] = await leer((tx) => tx.select().from(turnosCaja).where(eq(turnosCaja.id, turnoId)));
  expect(t).toMatchObject({ esperado: 1300000, contado: 1250000, diferencia: -50000, notas: 'Faltó cambio' });
  expect(t!.cerradoEn).not.toBeNull();
  const [a] = await leer((tx) =>
    tx.select().from(auditoria).where(and(eq(auditoria.accion, 'caja.cerrar'), eq(auditoria.entidadId, turnoId))),
  );
  expect(a!.despues).toMatchObject({ esperado: 1300000, diferencia: -50000 });
  expect(await leer((tx) => tx.select().from(movimientosCaja))).toHaveLength(1);
});

it('montos inválidos se rechazan', async () => {
  const turnoId = nuevoId();
  await enviar(e.tokenEncargado, op('caja.abrir', { turnoId, fondo: 0 }));
  const r = await enviar(
    e.tokenEncargado,
    op('caja.movimiento', { movimientoId: nuevoId(), turnoId, tipo: 'egreso', categoria: 'otro', monto: 0, motivo: 'x' }),
    op('caja.movimiento', { movimientoId: nuevoId(), turnoId, tipo: 'egreso', categoria: 'otro', monto: 100, motivo: '' }),
    op('caja.abrir', { turnoId: nuevoId(), fondo: -1 }),
  );
  expect(r.map((x) => x.error?.codigo)).toEqual(['DATOS_INVALIDOS', 'DATOS_INVALIDOS', 'DATOS_INVALIDOS']);
});

it('una caja con más de $ 20 millones se cierra igual (montos grandes)', async () => {
  const turnoId = nuevoId();
  const r = await enviar(
    e.tokenEncargado,
    op('caja.abrir', { turnoId, fondo: 0 }),
    op('caja.movimiento', { movimientoId: nuevoId(), turnoId, tipo: 'ingreso', categoria: 'otro', monto: 3_000_000_000, motivo: 'Recaudación' }),
    op('caja.cerrar', { turnoId, contado: 3_000_000_000 }),
  );
  expect(r.map((x) => x.estado)).toEqual(['aplicada', 'aplicada', 'aplicada']);
  const [t] = await leer((tx) => tx.select().from(turnosCaja).where(eq(turnosCaja.id, turnoId)));
  expect(t).toMatchObject({ esperado: 3_000_000_000, contado: 3_000_000_000, diferencia: 0 });
});
