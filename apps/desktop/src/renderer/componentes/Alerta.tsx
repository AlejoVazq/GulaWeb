import { useEffect, useRef, useState } from 'react';
import { sonarAviso } from '../sonido';

export const INTERVALO_MS = 8_000;
export const SILENCIO_MS = 60_000;

type Props = {
  /** Hay pedidos pendientes o avisos sin atender. */
  activa: boolean;
  /** Cuántas cosas hay sin atender: si sube, vuelve a sonar aunque esté silenciada. */
  cantidad?: number;
  reproducir?: () => void;
};

/** Suena cada 8 s mientras quede algo sin atender; solo se apaga cuando no queda nada. */
export function Alerta({ activa, cantidad = 0, reproducir = sonarAviso }: Props) {
  const [silenciada, setSilenciada] = useState(false);
  const sonar = useRef(reproducir);
  sonar.current = reproducir;
  const anterior = useRef(cantidad);

  useEffect(() => {
    if (!activa || silenciada) return;
    sonar.current();
    const t = setInterval(() => sonar.current(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [activa, silenciada]);

  useEffect(() => {
    if (!silenciada) return;
    const t = setTimeout(() => setSilenciada(false), SILENCIO_MS);
    return () => clearTimeout(t);
  }, [silenciada]);

  useEffect(() => {
    const llegoAlgo = cantidad > anterior.current;
    anterior.current = cantidad;
    if (llegoAlgo && silenciada) setSilenciada(false);
  }, [cantidad, silenciada]);

  useEffect(() => {
    if (!activa) setSilenciada(false);
  }, [activa]);

  if (!activa) return null;
  return (
    <div className={silenciada ? 'alerta' : 'alerta alerta--sonando'} role="status">
      <strong>Hay pedidos o avisos sin atender</strong>
      {silenciada ? (
        <span>(sonido silenciado un minuto)</span>
      ) : (
        <button type="button" className="boton" onClick={() => setSilenciada(true)}>
          Silenciar 1 minuto
        </button>
      )}
    </div>
  );
}
