import { useCallback, useEffect, useState } from 'react';
import type { TableroDelivery } from '../compartido/delivery';
import { escuchar, llamar } from './gula';

/** Tablero de delivery desde la base local; se recarga con `salon:cambio` y `caja:cambio` (un cobro lo mueve). */
export function useDelivery(): { tablero: TableroDelivery | null; envio: number; recargar: () => void } {
  const [tablero, setTablero] = useState<TableroDelivery | null>(null);
  const [envio, setEnvio] = useState(0);
  const recargar = useCallback(() => {
    void llamar('delivery:tablero')
      .then(setTablero)
      .catch(() => undefined);
    void llamar('delivery:config')
      .then((c) => setEnvio(c.envio))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    recargar();
    const a = escuchar('salon:cambio', recargar);
    const b = escuchar('caja:cambio', recargar);
    return () => {
      a();
      b();
    };
  }, [recargar]);
  return { tablero, envio, recargar };
}
