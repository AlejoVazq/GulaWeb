import type { FastifyRequest } from 'fastify';
import { ErrorApi } from '../errores.js';

/**
 * Límite de ventana fija en memoria. Se usa donde hacen falta varios límites en la misma ruta
 * (@fastify/rate-limit aplica uno solo por pedido).
 */
export function crearLimite(
  max: number,
  ventanaMs: number,
  clave: (req: FastifyRequest) => string,
) {
  const cuentas = new Map<string, { n: number; vence: number }>();
  return async (req: FastifyRequest): Promise<void> => {
    const ahora = Date.now();
    if (cuentas.size > 10_000)
      for (const [k, c] of cuentas) if (c.vence <= ahora) cuentas.delete(k);
    const k = clave(req);
    const c = cuentas.get(k);
    if (!c || c.vence <= ahora) {
      cuentas.set(k, { n: 1, vence: ahora + ventanaMs });
      return;
    }
    c.n++;
    if (c.n > max)
      throw new ErrorApi(
        429,
        'DEMASIADOS_INTENTOS',
        'Demasiados intentos. Probá de nuevo en un minuto.',
      );
  };
}
