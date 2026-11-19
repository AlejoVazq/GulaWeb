import { useEffect, useState } from 'react';
import type { TipoAviso } from '@gula/shared';
import { enviarAviso } from '../api';

export const BLOQUEO_AVISO_MS = 60_000;
const TEXTOS: Record<TipoAviso, string> = { llamar: 'Llamar a la moza', cuenta: 'Pedir la cuenta' };

/** "Llamar a la moza" / "Pedir la cuenta": cada botón se deshabilita un minuto después de usarlo. */
export function AvisosMesa({ token, onError }: { token: string; onError?: () => void }) {
  const [usados, setUsados] = useState<Partial<Record<TipoAviso, boolean>>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 5_000);
    return () => clearTimeout(t);
  }, [mensaje]);

  const avisar = async (tipo: TipoAviso) => {
    setUsados((u) => ({ ...u, [tipo]: true }));
    try {
      await enviarAviso(token, tipo);
      setMensaje('¡Listo! Ya le avisamos.');
      setTimeout(() => setUsados((u) => ({ ...u, [tipo]: false })), BLOQUEO_AVISO_MS);
    } catch {
      setUsados((u) => ({ ...u, [tipo]: false }));
      setMensaje('No pudimos avisar. Probá de nuevo.');
      onError?.();
    }
  };

  return (
    <div className="avisos-mesa" role="group" aria-label="Avisos a la moza">
      {(Object.keys(TEXTOS) as TipoAviso[]).map((t) => (
        <button
          key={t}
          type="button"
          className="boton-secundario"
          disabled={usados[t]}
          onClick={() => void avisar(t)}
        >
          {TEXTOS[t]}
        </button>
      ))}
      {mensaje && (
        <p className="avisos-mesa__mensaje" role="status">
          {mensaje}
        </p>
      )}
    </div>
  );
}
