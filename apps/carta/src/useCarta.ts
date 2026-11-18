import { useEffect, useState } from 'react';
import type { CartaPublica } from '@gula/shared';
import { LocalNoEncontrado, obtenerCarta } from './api';

export type EstadoCarta =
  | { tipo: 'cargando' }
  | { tipo: 'lista'; carta: CartaPublica }
  | { tipo: 'no-encontrado' }
  | { tipo: 'error' };

export function useCarta(slug: string): EstadoCarta {
  const [estado, setEstado] = useState<EstadoCarta>({ tipo: 'cargando' });
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
  }, [slug]);
  return estado;
}
