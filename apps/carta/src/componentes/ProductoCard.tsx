import { formatearPrecio, type ProductoPublico } from '@gula/shared';
import { IconoMas } from './Iconos';

type Props = {
  producto: ProductoPublico;
  habilitado: boolean;
  /** Cuántas unidades de este producto van en la comanda (todas sus variantes). */
  cantidadEnComanda: number;
  onElegir: (p: ProductoPublico) => void;
  /** Agregar sin pasar por el detalle; solo se usa si el producto no tiene opciones. */
  onAgregarRapido?: (p: ProductoPublico) => void;
};

/** Un renglón de la carta: nombre en itálica, precio en la columna del ticket y el "+" cuadrado. */
export function ProductoCard({ producto: p, habilitado, cantidadEnComanda, onElegir, onAgregarRapido }: Props) {
  const puede = habilitado && p.disponible;
  const conOpciones = p.grupos.length > 0;
  const mas = () => (!conOpciones && onAgregarRapido ? onAgregarRapido(p) : onElegir(p));
  const lleno = cantidadEnComanda > 0;
  const etiqueta = !p.disponible
    ? `Sin stock: ${p.nombre}`
    : lleno
      ? `Agregar otro ${p.nombre}, van ${cantidadEnComanda}`
      : `Agregar ${p.nombre}`;
  return (
    <article className={p.disponible ? 'producto' : 'producto producto--sin-stock'}>
      <button type="button" className="producto__abrir" disabled={!puede} onClick={() => onElegir(p)}>
        <h3 className="producto__nombre">{p.nombre}</h3>
        <span className="producto__desc">{p.disponible ? p.descripcion : 'Sin stock por hoy'}</span>
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
      </button>
      {p.foto && <img className="producto__foto" src={p.foto.chica} alt="" loading="lazy" width={64} height={64} />}
      <button
        type="button"
        className={lleno ? 'producto__mas producto__mas--lleno' : 'producto__mas'}
        disabled={!puede}
        aria-label={etiqueta}
        onClick={mas}
      >
        {lleno ? cantidadEnComanda : <IconoMas />}
      </button>
    </article>
  );
}
