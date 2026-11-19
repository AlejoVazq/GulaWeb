import { useState } from 'react';
import { llamar, mensajeDe } from '../gula';
import { useImpresion } from '../useImpresion';

/** Barra fija mientras haya tickets sin imprimir: no se va hasta reintentar con éxito o descartar. */
export function AvisoImpresion() {
  const { conError } = useImpresion();
  const [descartando, setDescartando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!conError.length) return null;
  const intentar = (fn: () => Promise<unknown>) => {
    setError(null);
    void fn().catch((e: unknown) => setError(mensajeDe(e)));
  };
  return (
    <div className="aviso-impresion" role="alert">
      {conError.map((t) => (
        <div key={t.id} className="fila fila--entre">
          <span>
            <strong>No se imprimió: {t.titulo}</strong> — {t.error}
          </span>
          {descartando === t.id ? (
            <span className="fila">
              <span>¿Descartar? Ya no se va a imprimir.</span>
              <button
                type="button"
                className="boton boton--peligro"
                onClick={() => {
                  setDescartando(null);
                  intentar(() => llamar('impresion:descartar', { id: t.id }));
                }}
              >
                Sí, descartar
              </button>
              <button type="button" className="boton" onClick={() => setDescartando(null)}>
                No
              </button>
            </span>
          ) : (
            <span className="fila">
              <button type="button" className="boton boton--principal" onClick={() => intentar(() => llamar('impresion:reintentar', { id: t.id }))}>
                Reintentar
              </button>
              <button type="button" className="boton" onClick={() => setDescartando(t.id)}>
                Descartar
              </button>
            </span>
          )}
        </div>
      ))}
      {error && <p>{error}</p>}
    </div>
  );
}
