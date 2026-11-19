import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { BaseLocal } from './db/base';
import { borrarKv, escribirKv, leerKv } from './db/kv';
import type { Cifrador } from './api/sesion';

/** Misma política que el servidor (apps/api/src/auth/pin.ts). */
export const MAX_FALLOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 5;

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const LARGO = 32;
const PREFIJO = 'pin:';

type Verificador = { sal: string; hash: string; fallos: number; bloqueadoHasta: number | null };

export type ResultadoPinLocal = 'ok' | 'incorrecto' | 'bloqueado' | 'sin_verificador';

const derivar = (pin: string, sal: Buffer) => scryptSync(pin, sal, LARGO, PARAMS);

/**
 * Verificador local de PIN para entrar sin conexión. Solo se crea tras un PIN aceptado por el
 * servidor; nunca se descarga un hash. Se guarda cifrado con el mismo cifrador del refresh token.
 */
export function crearPinLocal(base: BaseLocal, cifrador: Cifrador, ahora: () => number = Date.now) {
  const leer = (usuarioId: string): Verificador | null => {
    const crudo = leerKv(base, PREFIJO + usuarioId);
    if (!crudo) return null;
    try {
      return JSON.parse(cifrador.descifrar(crudo)) as Verificador;
    } catch {
      return null;
    }
  };
  const escribir = (usuarioId: string, v: Verificador) =>
    escribirKv(base, PREFIJO + usuarioId, cifrador.cifrar(JSON.stringify(v)));

  return {
    recordar(usuarioId: string, pin: string) {
      const sal = randomBytes(16);
      escribir(usuarioId, { sal: sal.toString('base64'), hash: derivar(pin, sal).toString('base64'), fallos: 0, bloqueadoHasta: null });
    },

    verificar(usuarioId: string, pin: string): ResultadoPinLocal {
      const v = leer(usuarioId);
      if (!v) return 'sin_verificador';
      if (v.bloqueadoHasta !== null && v.bloqueadoHasta > ahora()) return 'bloqueado';
      const esperado = Buffer.from(v.hash, 'base64');
      const calculado = derivar(pin, Buffer.from(v.sal, 'base64'));
      if (esperado.length === calculado.length && timingSafeEqual(esperado, calculado)) {
        if (v.fallos > 0 || v.bloqueadoHasta !== null) escribir(usuarioId, { ...v, fallos: 0, bloqueadoHasta: null });
        return 'ok';
      }
      const fallos = v.fallos + 1;
      if (fallos >= MAX_FALLOS_PIN) {
        escribir(usuarioId, { ...v, fallos: 0, bloqueadoHasta: ahora() + MINUTOS_BLOQUEO_PIN * 60_000 });
        return 'bloqueado';
      }
      escribir(usuarioId, { ...v, fallos, bloqueadoHasta: null });
      return 'incorrecto';
    },

    olvidar(usuarioId: string) {
      borrarKv(base, PREFIJO + usuarioId);
    },

    /** Con conexión manda el servidor: borra verificadores de usuarios que ya no están activos. */
    conservarSolo(ids: string[]) {
      const filas = base.db.prepare("SELECT clave FROM kv WHERE clave LIKE 'pin:%'").all() as { clave: string }[];
      const activos = new Set(ids);
      for (const { clave } of filas) if (!activos.has(clave.slice(PREFIJO.length))) borrarKv(base, clave);
    },

    tiene(usuarioId: string) {
      return leer(usuarioId) !== null;
    },
  };
}

export type PinLocal = ReturnType<typeof crearPinLocal>;
