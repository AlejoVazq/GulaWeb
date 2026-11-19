import { useCallback, useEffect, useState } from 'react';
import type { Salon } from '../compartido/salon';
import { escuchar, llamar } from './gula';

const VACIO: Salon = { mesas: [], pendientes: [], avisos: [] };

/** Estado del salón desde la base local; se recarga con cada `salon:cambio`. */
export function useSalon(): { salon: Salon; recargar: () => void } {
  const [salon, setSalon] = useState<Salon>(VACIO);
  const recargar = useCallback(() => {
    void llamar('salon:leer')
      .then(setSalon)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    recargar();
    return escuchar('salon:cambio', recargar);
  }, [recargar]);
  return { salon, recargar };
}
