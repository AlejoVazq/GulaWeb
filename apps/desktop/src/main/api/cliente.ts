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
  const raiz = () => (typeof opts.urlBase === 'function' ? opts.urlBase() : opts.urlBase);
  const url = (ruta: string, base = raiz()) => `${base.replace(/\/$/, '')}${ruta}`;
  const oyentes = new Map<Evento, Set<() => void>>();
  const emitir = (e: Evento) => oyentes.get(e)?.forEach((fn) => fn());
  let refrescando: Promise<boolean> | null = null;
  /** Cabecera `Date` de la última respuesta del servidor (para detectar el reloj de la PC mal puesto). */
  let ultimaFecha: string | null = null;

  async function crudo(
    metodo: Metodo,
    ruta: string,
    cuerpo: BodyInit | object | undefined,
    token: string | null,
    base?: string,
  ) {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (cuerpo instanceof FormData) body = cuerpo;
    else if (cuerpo !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(cuerpo);
    }
    let r: Response;
    try {
      r = await f(url(ruta, base), { method: metodo, headers, body, signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new SinConexion();
    }
    ultimaFecha = r.headers?.get?.('date') ?? ultimaFecha;
    return r;
  }

  async function error(r: Response): Promise<ErrorApiCliente> {
    const d = (await r.json().catch(() => null)) as { error?: { codigo?: string; mensaje?: string } } | null;
    return new ErrorApiCliente(r.status, d?.error?.codigo ?? 'ERROR', d?.error?.mensaje ?? `Error ${r.status}`);
  }

  /** Un único refresh a la vez: las llamadas concurrentes esperan la misma promesa. */
  function refrescar(): Promise<boolean> {
    if (refrescando) return refrescando;
    const p = (async () => {
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
    })();
    refrescando = p;
    void p.finally(() => {
      if (refrescando === p) refrescando = null;
    }).catch(() => undefined);
    return p;
  }

  /** Solo un 401 de sesión vencida justifica renovar (un PIN incorrecto también es 401). */
  async function esSesionVencida(r: Response): Promise<boolean> {
    if (r.status !== 401) return false;
    const d = (await r.clone().json().catch(() => null)) as { error?: { codigo?: string } } | null;
    return d?.error?.codigo === 'SESION_INVALIDA';
  }

  async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: object): Promise<T> {
    let s = opts.sesion.actual();
    if (s && !s.accessToken) {
      await refrescar();
      s = opts.sesion.actual();
    }
    const enviado = s?.accessToken ?? null;
    let r = await crudo(metodo, ruta, cuerpo, enviado);
    if (s && (await esSesionVencida(r))) {
      // Si otra llamada ya renovó mientras tanto, se reintenta con el token nuevo sin otro refresh.
      const actual = opts.sesion.actual()?.accessToken ?? null;
      const ok = actual && actual !== enviado ? true : await refrescar();
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
    /** `servidor` permite vincular contra otra URL sin tocar la configurada (se guarda solo si el login funciona). */
    async login(email: string, password: string, nombrePc: string, servidor?: string) {
      const r = await crudo('POST', '/auth/login', { email, password, dispositivo: { nombre: nombrePc } }, null, servidor);
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
    fechaServidor: () => ultimaFecha,
    refrescar,
    url,
  };
}

export type Cliente = ReturnType<typeof crearCliente>;
