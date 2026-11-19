import type {
  CartaPublica,
  ItemSolicitado,
  MesaPublica,
  PedidoPublico,
  TipoAviso,
} from '@gula/shared';

const BASE = import.meta.env.VITE_API ?? '/api';

export class LocalNoEncontrado extends Error {}

export async function obtenerCarta(slug: string, signal?: AbortSignal): Promise<CartaPublica> {
  const r = await fetch(`${BASE}/publico/locales/${encodeURIComponent(slug)}/carta`, { signal });
  if (r.status === 404) throw new LocalNoEncontrado(slug);
  if (!r.ok) throw new Error(`Error ${r.status} al cargar la carta`);
  return (await r.json()) as CartaPublica;
}

export class MesaNoEncontrada extends Error {}

/** La API respondió con un error (no es un problema de red). */
export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function errorDe(r: Response): Promise<ErrorApi> {
  const d = (await r.json().catch(() => null)) as {
    error?: { codigo?: string; mensaje?: string };
  } | null;
  return new ErrorApi(
    r.status,
    d?.error?.codigo ?? 'ERROR',
    d?.error?.mensaje ?? `Error ${r.status}`,
  );
}

const tok = (t: string) => encodeURIComponent(t);

export async function obtenerMesa(token: string, signal?: AbortSignal): Promise<MesaPublica> {
  const r = await fetch(`${BASE}/publico/mesas/${tok(token)}`, { signal });
  if (r.status === 404) throw new MesaNoEncontrada(token);
  if (!r.ok) throw await errorDe(r);
  return (await r.json()) as MesaPublica;
}

export async function enviarPedido(
  token: string,
  cuerpo: { id: string; items: ItemSolicitado[] },
): Promise<PedidoPublico> {
  const r = await fetch(`${BASE}/publico/mesas/${tok(token)}/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) throw await errorDe(r);
  return (await r.json()) as PedidoPublico;
}

export async function consultarPedido(id: string, token: string): Promise<PedidoPublico> {
  const r = await fetch(`${BASE}/publico/pedidos/${encodeURIComponent(id)}?token=${tok(token)}`, {
    cache: 'no-store',
  });
  if (!r.ok) throw await errorDe(r);
  return (await r.json()) as PedidoPublico;
}

export async function enviarAviso(token: string, tipo: TipoAviso): Promise<void> {
  const r = await fetch(`${BASE}/publico/mesas/${tok(token)}/avisos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tipo }),
  });
  if (!r.ok) throw await errorDe(r);
}
