import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { nuevoId, ROLES, type Rol } from '@gula/shared';
import type { Tx } from '../db/cliente.js';
import { refreshTokens } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { sha256 } from './hash.js';

export const DURACION_ACCESO = '15m';
export const DIAS_REFRESH = 30;

export type Claims = { sub: string; loc: string; dev: string; rol: Rol };

const clave = (secreto: string) => new TextEncoder().encode(secreto);

export function firmarAcceso(claims: Claims, secreto: string): Promise<string> {
  return new SignJWT({ loc: claims.loc, dev: claims.dev, rol: claims.rol })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(DURACION_ACCESO)
    .sign(clave(secreto));
}

export async function verificarAcceso(token: string, secreto: string): Promise<Claims> {
  try {
    const { payload } = await jwtVerify(token, clave(secreto), { algorithms: ['HS256'] });
    const { sub, loc, dev, rol } = payload as Record<string, unknown>;
    if (
      typeof sub !== 'string' ||
      typeof loc !== 'string' ||
      typeof dev !== 'string' ||
      !ROLES.includes(rol as Rol)
    ) {
      throw new Error('claims incompletos');
    }
    return { sub, loc, dev, rol: rol as Rol };
  } catch {
    throw new ErrorApi(401, 'SESION_INVALIDA', 'Tu sesión no es válida. Volvé a ingresar.');
  }
}

/** Crea un refresh token opaco; en la base solo queda su hash. */
export async function emitirRefresh(
  tx: Tx,
  datos: { localId: string; dispositivoId: string; usuarioId: string; familia?: string },
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await tx.insert(refreshTokens).values({
    id: nuevoId(),
    localId: datos.localId,
    dispositivoId: datos.dispositivoId,
    usuarioId: datos.usuarioId,
    familia: datos.familia ?? nuevoId(),
    hash: sha256(token),
    expiraEn: new Date(Date.now() + DIAS_REFRESH * 24 * 60 * 60 * 1000),
  });
  return token;
}
