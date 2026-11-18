import type { CartaPublica } from '@gula/shared';

const BASE = import.meta.env.VITE_API ?? '/api';

export class LocalNoEncontrado extends Error {}

export async function obtenerCarta(slug: string, signal?: AbortSignal): Promise<CartaPublica> {
  const r = await fetch(`${BASE}/publico/locales/${encodeURIComponent(slug)}/carta`, { signal });
  if (r.status === 404) throw new LocalNoEncontrado(slug);
  if (!r.ok) throw new Error(`Error ${r.status} al cargar la carta`);
  return (await r.json()) as CartaPublica;
}
