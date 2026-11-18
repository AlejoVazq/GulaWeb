import type { Rol } from '@gula/shared';
import type { BaseLocal } from '../db/base';
import { borrarKv, escribirKv, leerKv } from '../db/kv';

export type Cifrador = { cifrar(texto: string): string; descifrar(texto: string): string };
export type LocalSesion = { id: string; nombre: string; slug: string };
export type UsuarioSesion = { id: string; nombre: string; rol: Rol };

export type SesionGuardada = {
  accessToken: string | null;
  refreshToken: string;
  usuario: UsuarioSesion;
  local: LocalSesion;
  dispositivoId: string;
};

type EnDisco = Omit<SesionGuardada, 'accessToken' | 'refreshToken'> & { refreshCifrado: string };

const CLAVE = 'sesion';

/**
 * Sesión del dispositivo. El refresh token se guarda cifrado (safeStorage en producción);
 * el access token vive solo en memoria.
 */
export function crearSesion(base: BaseLocal, cifrador: Cifrador) {
  let accessToken: string | null = null;

  const leer = (): SesionGuardada | null => {
    const crudo = leerKv(base, CLAVE);
    if (!crudo) return null;
    try {
      const d = JSON.parse(crudo) as EnDisco;
      return {
        accessToken,
        refreshToken: cifrador.descifrar(d.refreshCifrado),
        usuario: d.usuario,
        local: d.local,
        dispositivoId: d.dispositivoId,
      };
    } catch {
      return null;
    }
  };

  const escribir = (s: Omit<SesionGuardada, 'accessToken'>) => {
    const d: EnDisco = {
      usuario: s.usuario,
      local: s.local,
      dispositivoId: s.dispositivoId,
      refreshCifrado: cifrador.cifrar(s.refreshToken),
    };
    escribirKv(base, CLAVE, JSON.stringify(d));
  };

  return {
    guardar(s: SesionGuardada & { accessToken: string }) {
      accessToken = s.accessToken;
      escribir(s);
    },
    actual: leer,
    fijarTokens(t: { accessToken: string; refreshToken?: string; usuario?: UsuarioSesion }) {
      const s = leer();
      if (!s) return;
      accessToken = t.accessToken;
      escribir({ ...s, refreshToken: t.refreshToken ?? s.refreshToken, usuario: t.usuario ?? s.usuario });
    },
    olvidarAcceso() {
      accessToken = null;
    },
    borrar() {
      accessToken = null;
      borrarKv(base, CLAVE);
    },
  };
}

export type Sesion = ReturnType<typeof crearSesion>;
