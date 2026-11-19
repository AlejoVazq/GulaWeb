import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { MOTIVO_MAXIMO, sinControl } from '@gula/shared';
import { PRECIO_MAXIMO } from '../carta/productos.rutas.js';
import type { Tx } from '../db/cliente.js';
import { turnosCaja } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { noEncontrado } from '../carta/comun.js';

export const monto = z.number().int().min(1).max(PRECIO_MAXIMO);
export const montoOCero = z.number().int().min(0).max(PRECIO_MAXIMO);
export const motivo = z.string().max(MOTIVO_MAXIMO).transform(sinControl).pipe(z.string().min(1));

export const cajaCerrada = () =>
  new ErrorApi(409, 'CAJA_CERRADA', 'La caja está cerrada. Abrila para seguir.');

/** El turno, bloqueado para la operación; tiene que estar abierto. */
export async function turnoAbierto(tx: Tx, turnoId: string) {
  const [t] = await tx.select().from(turnosCaja).where(eq(turnosCaja.id, turnoId)).for('update');
  if (!t) throw noEncontrado('esa caja');
  if (t.cerradoEn) throw cajaCerrada();
  return t;
}
