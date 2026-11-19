import { useCallback, useEffect, useState } from 'react';
import type { EstadoCaja } from '../compartido/caja';
import type { Pedido } from '../compartido/salon';
import { escuchar, llamar } from './gula';

export type VistaCaja = EstadoCaja & { porCobrar: Pedido[] };

/** Estado de la caja desde la base local; se recarga con `caja:cambio` y `salon:cambio`. */
export function useCaja(): { caja: VistaCaja | null; recargar: () => void } {
  const [caja, setCaja] = useState<VistaCaja | null>(null);
  const recargar = useCallback(() => {
    void llamar('caja:leer')
      .then(setCaja)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    recargar();
    const a = escuchar('caja:cambio', recargar);
    const b = escuchar('salon:cambio', recargar);
    return () => {
      a();
      b();
    };
  }, [recargar]);
  return { caja, recargar };
}
