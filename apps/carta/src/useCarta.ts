import { useCallback, useEffect, useState } from 'react';
import type { CartaPublica } from '@gula/shared';
import { LocalNoEncontrado, obtenerCarta } from './api';

export type EstadoCarta =
  | { tipo: 'cargando' }
  | { tipo: 'lista'; carta: CartaPublica }
  | { tipo: 'no-encontrado' }
  | { tipo: 'error' };

export function useCarta(slug: string): { estado: EstadoCarta; reintentar: () => void } {
  const [estado, setEstado] = useState<EstadoCarta>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    const control = new AbortController();
    setEstado({ tipo: 'cargando' });
    obtenerCarta(slug, control.signal)
      .then((carta) => setEstado({ tipo: 'lista', carta }))
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        setEstado(e instanceof LocalNoEncontrado ? { tipo: 'no-encontrado' } : { tipo: 'error' });
      });
    return () => control.abort();
  }, [slug, intento]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { estado, reintentar };
}
