import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { dispositivos, locales, refreshTokens, usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { hashear, verificarHash } from '../seguridad/hash.js';
import { emitirRefresh, firmarAcceso } from '../seguridad/tokens.js';

const credencialesInvalidas = () =>
  new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');

// Hash de relleno para que un email inexistente tarde lo mismo que uno existente.
const hashRelleno = hashear('relleno-para-tiempo-constante');

export async function loginDispositivo(
  dbs: Dbs,
  jwtSecret: string,
  datos: { email: string; password: string; nombreDispositivo: string },
) {
  const [fila] = await dbs.dbAdmin
    .select({ usuario: usuarios, local: locales })
    .from(usuarios)
    .innerJoin(locales, eq(locales.id, usuarios.localId))
    .where(
      and(
        eq(usuarios.email, datos.email),
        eq(usuarios.activo, true),
        isNotNull(usuarios.passwordHash),
        inArray(usuarios.rol, ['dueno', 'encargado']),
      ),
    );

  const ok = fila
    ? await verificarHash(fila.usuario.passwordHash!, datos.password)
    : (await verificarHash(await hashRelleno, datos.password), false);
  if (!fila || !ok) throw credencialesInvalidas();

  const { usuario, local } = fila;
  const dispositivoId = nuevoId();
  const refreshToken = await conLocal(dbs.dbApp, local.id, async (tx) => {
    // Un único dispositivo activo por local (spec §11).
    await tx.update(dispositivos).set({ activo: false }).where(eq(dispositivos.activo, true));
    await tx.update(refreshTokens).set({ revocado: true }).where(eq(refreshTokens.revocado, false));
    await tx.insert(dispositivos).values({
      id: dispositivoId,
      localId: local.id,
      nombre: datos.nombreDispositivo,
      ultimoUso: new Date(),
    });
    return emitirRefresh(tx, { localId: local.id, dispositivoId, usuarioId: usuario.id });
  });
  const accessToken = await firmarAcceso(
    { sub: usuario.id, loc: local.id, dev: dispositivoId, rol: usuario.rol },
    jwtSecret,
  );
  return {
    accessToken,
    refreshToken,
    dispositivoId,
    usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    local: { id: local.id, nombre: local.nombre, slug: local.slug },
  };
}
