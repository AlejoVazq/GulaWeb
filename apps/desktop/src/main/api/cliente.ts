import type { Sesion, UsuarioSesion } from './sesion';

export class SinConexion extends Error {
  constructor() {
    super('Sin conexión con el servidor');
    this.name = 'SinConexion';
  }
}

export class ErrorApiCliente extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    public readonly mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApiCliente';
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Evento = 'sesion-cerrada';

export function crearCliente(opts: { urlBase: string | (() => string); sesion: Sesion; fetch?: typeof fetch }) {
  const f = opts.fetch ?? fetch;
  const url = (ruta: string) => `${typeof opts.urlBase === 'function' ? opts.urlBase() : opts.urlBase}${ruta}`;
  const oyentes = new Map<Evento, Set<() => void>>();
  const emitir = (e: Evento) => oyentes.get(e)?.forEach((fn) => fn());
  let refrescando: Promise<boolean> | null = null;

  async function crudo(metodo: Metodo, ruta: string, cuerpo: BodyInit | object | undefined, token: string | null) {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (cuerpo instanceof FormData) body = cuerpo;
    else if (cuerpo !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(cuerpo);
    }
    try {
      return await f(url(ruta), { method: metodo, headers, body, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new SinConexion();
    }
  }

  async function error(r: Response): Promise<ErrorApiCliente> {
    const d = (await r.json().catch(() => null)) as { error?: { codigo?: string; mensaje?: string } } | null;
    return new ErrorApiCliente(r.status, d?.error?.codigo ?? 'ERROR', d?.error?.mensaje ?? `Error ${r.status}`);
  }

  /** Un único refresh a la vez: las llamadas concurrentes esperan la misma promesa. */
  function refrescar(): Promise<boolean> {
    refrescando ??= (async () => {
      try {
        const s = opts.sesion.actual();
        if (!s) return false;
        const r = await crudo('POST', '/auth/refresh', { refreshToken: s.refreshToken }, null);
        if (!r.ok) {
          if (r.status === 401) {
            opts.sesion.borrar();
            emitir('sesion-cerrada');
          }
          return false;
        }
        const t = (await r.json()) as { accessToken: string; refreshToken: string };
        opts.sesion.fijarTokens(t);
        return true;
      } finally {
        refrescando = null;
      }
    })();
    return refrescando;
  }

  async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: object | FormData): Promise<T> {
    let s = opts.sesion.actual();
    if (s && !s.accessToken) {
      await refrescar();
      s = opts.sesion.actual();
    }
    let r = await crudo(metodo, ruta, cuerpo, s?.accessToken ?? null);
    if (r.status === 401 && s) {
      const ok = await refrescar();
      if (!ok) throw new ErrorApiCliente(401, 'SESION_INVALIDA', 'Tu sesión no es válida. Volvé a ingresar.');
      r = await crudo(metodo, ruta, cuerpo, opts.sesion.actual()?.accessToken ?? null);
    }
    if (!r.ok) throw await error(r);
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  return {
    pedir,
    on(e: Evento, fn: () => void) {
      if (!oyentes.has(e)) oyentes.set(e, new Set());
      oyentes.get(e)!.add(fn);
      return () => oyentes.get(e)?.delete(fn);
    },
    async login(email: string, password: string, nombrePc: string) {
      const r = await crudo('POST', '/auth/login', { email, password, dispositivo: { nombre: nombrePc } }, null);
      if (!r.ok) throw await error(r);
      const d = (await r.json()) as {
        accessToken: string;
        refreshToken: string;
        dispositivoId: string;
        usuario: UsuarioSesion;
        local: { id: string; nombre: string; slug: string };
      };
      opts.sesion.guardar(d);
      return d;
    },
    async pin(usuarioId: string, pinTexto: string) {
      const d = await pedir<{ accessToken: string; usuario: UsuarioSesion }>('POST', '/auth/pin', {
        usuarioId,
        pin: pinTexto,
      });
      opts.sesion.fijarTokens({ accessToken: d.accessToken, usuario: d.usuario });
      return d;
    },
    tokenActual: () => opts.sesion.actual()?.accessToken ?? null,
    refrescar,
    url,
  };
}

export type Cliente = ReturnType<typeof crearCliente>;
