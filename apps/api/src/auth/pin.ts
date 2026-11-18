import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Rol } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { refreshTokens, usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { verificarHash } from '../seguridad/hash.js';

export const MAX_FALLOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 5;

export type UsuarioPublico = { id: string; nombre: string; rol: Rol };
type ResultadoPin =
  { usuario: UsuarioPublico } | { error: 'no_existe' | 'bloqueado' | 'incorrecto' };

/**
 * Verifica el PIN de un usuario activo del local. Lleva el contador de fallos y el bloqueo:
 * al 5.º fallo el usuario queda bloqueado 5 minutos (spec, Review Focus 1).
 */
export async function verificarPin(
  dbs: Dbs,
  localId: string,
  usuarioId: string,
  pin: string,
): Promise<UsuarioPublico> {
  const r = await conLocal(dbs.dbApp, localId, async (tx): Promise<ResultadoPin> => {
    const [u] = await tx
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.activo, true)))
      .for('update');
    if (!u) return { error: 'no_existe' };
    if (u.pinBloqueadoHasta && u.pinBloqueadoHasta > new Date()) return { error: 'bloqueado' };

    if (!(await verificarHash(u.pinHash, pin))) {
      const fallos = u.pinFallos + 1;
      await tx
        .update(usuarios)
        .set(
          fallos >= MAX_FALLOS_PIN
            ? {
                pinFallos: 0,
                pinBloqueadoHasta: sql`now() + make_interval(mins => ${MINUTOS_BLOQUEO_PIN})`,
              }
            : { pinFallos: fallos },
        )
        .where(eq(usuarios.id, u.id));
      return { error: 'incorrecto' };
    }
    if (u.pinFallos > 0 || u.pinBloqueadoHasta) {
      await tx
        .update(usuarios)
        .set({ pinFallos: 0, pinBloqueadoHasta: null })
        .where(eq(usuarios.id, u.id));
    }
    return { usuario: { id: u.id, nombre: u.nombre, rol: u.rol } };
  });

  if ('usuario' in r) return r.usuario;
  if (r.error === 'no_existe')
    throw new ErrorApi(404, 'NO_ENCONTRADO', 'No encontramos ese usuario.');
  if (r.error === 'bloqueado') {
    throw new ErrorApi(
      423,
      'PIN_BLOQUEADO',
      'Demasiados intentos. Esperá 5 minutos y probá de nuevo.',
    );
  }
  throw new ErrorApi(401, 'PIN_INCORRECTO', 'PIN incorrecto.');
}

export function listarUsuariosActivos(dbs: Dbs, localId: string): Promise<UsuarioPublico[]> {
  return conLocal(dbs.dbApp, localId, (tx) =>
    tx
      .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol })
      .from(usuarios)
      .where(eq(usuarios.activo, true))
      .orderBy(asc(usuarios.nombre)),
  );
}

/**
 * Tras un cambio por PIN, los refresh vigentes del dispositivo pasan a ser del nuevo usuario:
 * renovar la sesión nunca devuelve el rol de quien hizo el login con email (p. ej. el dueño).
 */
export async function fijarUsuarioDelDispositivo(
  dbs: Dbs,
  localId: string,
  dispositivoId: string,
  usuarioId: string,
): Promise<void> {
  await conLocal(dbs.dbApp, localId, (tx) =>
    tx
      .update(refreshTokens)
      .set({ usuarioId })
      .where(
        and(
          eq(refreshTokens.dispositivoId, dispositivoId),
          eq(refreshTokens.revocado, false),
          isNull(refreshTokens.usadoEn),
        ),
      ),
  );
}
