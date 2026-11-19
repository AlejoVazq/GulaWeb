import { useEffect, useRef } from 'react';
import type { CategoriaPublica } from '@gula/shared';

export const anclaCategoria = (id: string) => `cat-${id}`;

export function Categorias({ categorias, activa }: { categorias: CategoriaPublica[]; activa: string | null }) {
  const nav = useRef<HTMLElement>(null);
  // Mantener a la vista la pestaña activa cuando la lista es más ancha que la pantalla.
  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activa]);
  return (
    <nav className="categorias" aria-label="Categorías" ref={nav}>
      {categorias.map((c) => (
        <a
          key={c.id}
          href={`#${anclaCategoria(c.id)}`}
          className="categorias__item"
          aria-current={c.id === activa ? 'true' : undefined}
        >
          {c.nombre}
        </a>
      ))}
    </nav>
  );
}
