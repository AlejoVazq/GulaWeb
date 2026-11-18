import type { CategoriaPublica } from '@gula/shared';

export const anclaCategoria = (id: string) => `cat-${id}`;

export function Categorias({ categorias }: { categorias: CategoriaPublica[] }) {
  return (
    <nav className="categorias" aria-label="Categorías">
      {categorias.map((c) => (
        <a key={c.id} href={`#${anclaCategoria(c.id)}`} className="categorias__item">
          {c.nombre}
        </a>
      ))}
    </nav>
  );
}
