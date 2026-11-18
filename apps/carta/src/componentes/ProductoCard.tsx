import { formatearPrecio, type ProductoPublico } from '@gula/shared';

type Props = {
  producto: ProductoPublico;
  habilitado: boolean;
  onElegir: (p: ProductoPublico) => void;
};

export function ProductoCard({ producto: p, habilitado, onElegir }: Props) {
  const puede = habilitado && p.disponible;
  return (
    <button type="button" className="producto" disabled={!puede} onClick={() => onElegir(p)}>
      <span className="producto__texto">
        <span className="producto__nombre">{p.nombre}</span>
        {p.descripcion && <span className="producto__desc">{p.descripcion}</span>}
        {p.etiquetas.length > 0 && (
          <span className="producto__etiquetas">
            {p.etiquetas.map((e) => (
              <span key={e} className="etiqueta">
                {e}
              </span>
            ))}
          </span>
        )}
        <span className="producto__precio">{formatearPrecio(p.precio)}</span>
        {!p.disponible && <span className="producto__sin-stock">Sin stock</span>}
      </span>
      {p.foto && (
        <img
          className="producto__foto"
          src={p.foto.chica}
          alt=""
          loading="lazy"
          width={96}
          height={96}
        />
      )}
    </button>
  );
}
