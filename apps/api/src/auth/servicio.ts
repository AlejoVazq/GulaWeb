import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { nuevoId } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { dispositivos, locales, refreshTokens, usuarios } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { sesionInvalida, type Sesion } from './plugin.js';
import { hashear, sha256, verificarHash } from '../seguridad/hash.js';
import { emitirRefresh, firmarAcceso } from '../seguridad/tokens.js';

export const MARGEN_REINTENTO_MS = 30_000;

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

export async function refrescar(dbs: Dbs, jwtSecret: string, token: string) {
  const resultado = await dbs.dbAdmin.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.hash, sha256(token)))
      .for('update');
    if (!t) return { error: 'invalido' as const };
    // Margen para reintentos (respuesta perdida, wifi inestable): no se considera reuso.
    const enMargen = t.usadoEn !== null && Date.now() - t.usadoEn.getTime() < MARGEN_REINTENTO_MS;
    if (t.usadoEn && !enMargen) {
      // Reuso: alguien tiene una copia vieja. Se revoca la familia completa.
      await tx.update(refreshTokens).set({ revocado: true }).where(eq(refreshTokens.familia, t.familia));
      return { error: 'reuso' as const };
    }
    if (t.revocado || t.expiraEn < new Date()) return { error: 'invalido' as const };
    const [d] = await tx
      .select({ id: dispositivos.id })
      .from(dispositivos)
      .where(and(eq(dispositivos.id, t.dispositivoId), eq(dispositivos.activo, true)));
    const [u] = await tx
      .select({ rol: usuarios.rol })
      .from(usuarios)
      .where(and(eq(usuarios.id, t.usuarioId), eq(usuarios.activo, true)));
    if (!d || !u) return { error: 'invalido' as const };

    if (!t.usadoEn) {
      await tx.update(refreshTokens).set({ usadoEn: new Date() }).where(eq(refreshTokens.id, t.id));
    }
    const nuevo = await emitirRefresh(tx, {
      localId: t.localId,
      dispositivoId: t.dispositivoId,
      usuarioId: t.usuarioId,
      familia: t.familia,
    });
    return { t, rol: u.rol, nuevo };
  });

  if ('error' in resultado) {
    if (resultado.error === 'reuso') {
      throw new ErrorApi(401, 'TOKEN_REUTILIZADO', 'La sesión se cerró por seguridad. Volvé a ingresar.');
    }
    throw sesionInvalida();
  }
  const { t, rol, nuevo } = resultado;
  const accessToken = await firmarAcceso(
    { sub: t.usuarioId, loc: t.localId, dev: t.dispositivoId, rol },
    jwtSecret,
  );
  return { accessToken, refreshToken: nuevo };
}

export async function logout(dbs: Dbs, sesion: Sesion): Promise<void> {
  await conLocal(dbs.dbApp, sesion.localId, async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revocado: true })
      .where(eq(refreshTokens.dispositivoId, sesion.dispositivoId));
    await tx.update(dispositivos).set({ activo: false }).where(eq(dispositivos.id, sesion.dispositivoId));
  });
}

export async function quienSoy(dbs: Dbs, sesion: Sesion) {
  return conLocal(dbs.dbApp, sesion.localId, async (tx) => {
    const [u] = await tx.select().from(usuarios).where(eq(usuarios.id, sesion.usuarioId));
    const [l] = await tx.select().from(locales).where(eq(locales.id, sesion.localId));
    if (!u || !l) throw sesionInvalida();
    return {
      usuario: { id: u.id, nombre: u.nombre, rol: u.rol },
      local: { id: l.id, nombre: l.nombre, slug: l.slug },
    };
  });
}
