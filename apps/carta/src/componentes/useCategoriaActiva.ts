import { useEffect, useState } from 'react';
import { anclaCategoria } from './Categorias';

/** La categoría que está pasando bajo las pestañas al hacer scroll (la primera si no se puede observar). */
export function useCategoriaActiva(ids: string[]): string | null {
  const [activa, setActiva] = useState<string | null>(ids[0] ?? null);
  const clave = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibles = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visibles.set(e.target.id, e.isIntersecting);
        const primera = ids.find((id) => visibles.get(anclaCategoria(id)));
        if (primera) setActiva(primera);
      },
      // Franja angosta justo debajo de las pestañas fijas.
      { rootMargin: '-120px 0px -60% 0px' },
    );
    for (const id of ids) {
      const el = document.getElementById(anclaCategoria(id));
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [clave]); // ids cambia de identidad en cada render; clave captura su contenido
  return activa;
}
