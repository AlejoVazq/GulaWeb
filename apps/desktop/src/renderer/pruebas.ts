import { vi } from 'vitest';
import type { PuenteGula, Sobre } from '../compartido/ipc';

type Respuestas = Partial<Record<string, (...a: unknown[]) => unknown>>;

/** window.gula falso: cada canal responde con la función dada (si lanza {codigo,mensaje}, es un error). */
export function puenteFalso(respuestas: Respuestas) {
  const oyentes = new Map<string, Set<(d: unknown) => void>>();
  const invocar = vi.fn(async (canal: string, ...args: unknown[]): Promise<Sobre<unknown>> => {
    const fn = respuestas[canal];
    if (!fn) return { ok: true, valor: undefined };
    try {
      return { ok: true, valor: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e as { codigo: string; mensaje: string } };
    }
  });
  const puente = {
    invocar,
    escuchar: (ev: string, fn: (d: unknown) => void) => {
      if (!oyentes.has(ev)) oyentes.set(ev, new Set());
      oyentes.get(ev)!.add(fn);
      return () => oyentes.get(ev)?.delete(fn);
    },
  } as unknown as PuenteGula;
  window.gula = puente;
  return { invocar, emitir: (ev: string, d: unknown) => oyentes.get(ev)?.forEach((f) => f(d)) };
}
