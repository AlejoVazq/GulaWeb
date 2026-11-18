import { useEffect, useRef } from 'react';

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento de diálogo modal: enfoca el primer control al abrir, atrapa Tab dentro,
 * cierra con Escape y devuelve el foco a quien lo abrió.
 */
export function useDialogo<T extends HTMLElement>(onCerrar: () => void) {
  const ref = useRef<T>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const nodo = ref.current;
    nodo?.querySelector<HTMLElement>(ENFOCABLES)?.focus();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cerrar.current();
        return;
      }
      if (e.key !== 'Tab' || !nodo) return;
      const items = [...nodo.querySelectorAll<HTMLElement>(ENFOCABLES)];
      if (!items.length) return;
      const primero = items[0]!;
      const ultimo = items[items.length - 1]!;
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !nodo.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !nodo.contains(activo))) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  return ref;
}
