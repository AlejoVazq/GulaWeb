import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { MONTO_MAXIMO_CAJA, MOTIVO_MAXIMO, sinControl } from '@gula/shared';
import type { Tx } from '../db/cliente.js';
import { turnosCaja } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';

export const monto = z.number().int().min(1).max(MONTO_MAXIMO_CAJA);
export const montoOCero = z.number().int().min(0).max(MONTO_MAXIMO_CAJA);
export const motivo = z.string().max(MOTIVO_MAXIMO).transform(sinControl).pipe(z.string().min(1));

export const cajaCerrada = () =>
  new ErrorApi(409, 'CAJA_CERRADA', 'La caja está cerrada. Abrila para seguir.');

/** El turno, bloqueado para la operación; tiene que estar abierto. */
export async function turnoAbierto(tx: Tx, turnoId: string) {
  const [t] = await tx.select().from(turnosCaja).where(eq(turnosCaja.id, turnoId)).for('update');
  if (!t) throw cajaCerrada();
  if (t.cerradoEn) throw cajaCerrada();
  return t;
}
