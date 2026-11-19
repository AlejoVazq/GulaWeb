import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Diálogo modal mínimo: título accesible, foco adentro al abrir, Escape cierra. */
export function Dialogo({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    return () => previo?.focus?.();
  }, []);
  return (
    <div className="velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        ref={ref}
        className="dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCerrar();
          }
        }}
      >
        <h2 id={id} className="dialogo__titulo">
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}
