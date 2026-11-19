import { useCallback, useEffect, useState } from 'react';
import type { TrabajoImpresion } from '../compartido/impresion';
import { escuchar, llamar } from './gula';

type Trabajos = { conError: TrabajoImpresion[]; recientes: TrabajoImpresion[] };

/** Trabajos de la cola de impresión; se recargan con cada `impresion:cambio`. */
export function useImpresion(): Trabajos & { recargar: () => void } {
  const [t, setT] = useState<Trabajos>({ conError: [], recientes: [] });
  const recargar = useCallback(() => {
    void llamar('impresion:trabajos')
      .then(setT)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    recargar();
    return escuchar('impresion:cambio', recargar);
  }, [recargar]);
  return { ...t, recargar };
}
