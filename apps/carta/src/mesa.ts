import { useCallback, useEffect, useRef, useState } from 'react';
import { nuevoId, type ItemSolicitado, type MesaPublica, type PedidoPublico } from '@gula/shared';
import { ErrorApi, MesaNoEncontrada, enviarPedido, obtenerMesa } from './api';

export type EstadoMesa =
  | { tipo: 'sin-mesa' }
  | { tipo: 'cargando' }
  | { tipo: 'lista'; mesa: MesaPublica }
  | { tipo: 'no-encontrada' }
  | { tipo: 'error' };

/** Estado de la mesa del QR; se vuelve a consultar al volver a la pestaña. */
export function useMesa(token: string | undefined) {
  const [estado, setEstado] = useState<EstadoMesa>(
    token ? { tipo: 'cargando' } : { tipo: 'sin-mesa' },
  );
  const recargar = useCallback(() => {
    if (!token) return;
    obtenerMesa(token)
      .then((mesa) => setEstado({ tipo: 'lista', mesa }))
      .catch((e: unknown) =>
        setEstado((previo) =>
          e instanceof MesaNoEncontrada
            ? { tipo: 'no-encontrada' }
            : previo.tipo === 'lista'
              ? previo
              : { tipo: 'error' },
        ),
      );
  }, [token]);
  useEffect(() => {
    recargar();
    const alVolver = () => document.visibilityState !== 'hidden' && recargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [recargar]);
  return { estado, recargar };
}

const leer = <T>(clave: string, porDefecto: T): T => {
  try {
    const v = sessionStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
};
const escribir = (clave: string, v: unknown) => {
  try {
    if (v === null) sessionStorage.removeItem(clave);
    else sessionStorage.setItem(clave, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: vive en memoria */
  }
};

export const REINTENTOS = 3;
export const ESPERA_REINTENTO_MS = 800;

/** Un error que vale la pena reintentar: sin red o el servidor falló (no un rechazo de negocio). */
const reintentable = (e: unknown) =>
  !(e instanceof ErrorApi) || (e.status >= 500 && e.status !== 503);

/**
 * Envío de pedidos de la mesa. El id se genera una vez por envío y se reutiliza en cada reintento
 * (también si se recarga la página), así el servidor nunca duplica el pedido.
 */
export function useEnvioPedidos(token: string | undefined, sesion?: string | null) {
  const claveEnvio = `gula:envio:${token}`;
  const clavePedidos = `gula:pedidos:${token}`;
  const claveSesion = `gula:sesion:${token}`;
  const [pedidos, setPedidos] = useState<PedidoPublico[]>(() =>
    token ? leer(clavePedidos, []) : [],
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorApi | Error | null>(null);
  const idEnCurso = useRef<string | null>(token ? leer<string | null>(claveEnvio, null) : null);

  useEffect(() => {
    if (token) escribir(clavePedidos, pedidos);
  }, [token, clavePedidos, pedidos]);

  // Los talones son de la sesión en la que se pidieron: si la mesa se cerró (o ya es otra sesión),
  // se descartan para que el próximo que escanee el QR no vea el pedido anterior.
  useEffect(() => {
    if (!token || sesion === undefined) return;
    const anterior = leer<string | null>(claveSesion, null);
    if (sesion === null || (anterior !== null && anterior !== sesion)) setPedidos([]);
    escribir(claveSesion, sesion);
  }, [token, claveSesion, sesion]);

  const enviar = async (items: ItemSolicitado[]): Promise<boolean> => {
    if (!token) return false;
    if (!idEnCurso.current) {
      idEnCurso.current = nuevoId();
      escribir(claveEnvio, idEnCurso.current);
    }
    const id = idEnCurso.current;
    setEnviando(true);
    setError(null);
    try {
      for (let intento = 1; ; intento++) {
        try {
          const p = await enviarPedido(token, { id, items });
          idEnCurso.current = null;
          escribir(claveEnvio, null);
          setPedidos((ps) => [p, ...ps.filter((x) => x.id !== p.id)]);
          return true;
        } catch (e) {
          if (!reintentable(e) || intento >= REINTENTOS) throw e;
          await new Promise((r) => setTimeout(r, ESPERA_REINTENTO_MS * intento));
        }
      }
    } catch (e) {
      // Un rechazo de negocio no se reintenta: el próximo envío lleva otro id.
      if (e instanceof ErrorApi && !reintentable(e)) {
        idEnCurso.current = null;
        escribir(claveEnvio, null);
      }
      setError(e instanceof Error ? e : new Error(String(e)));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  return { pedidos, enviar, enviando, error };
}
