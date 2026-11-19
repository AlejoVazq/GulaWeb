import { maquetar, type Documento } from '../../compartido/impresion';

/** El ticket tal como sale de la térmica: monoespaciado, al ancho real del papel en columnas. */
export function Ticket({ documento, columnas }: { documento: Documento; columnas: number }) {
  return (
    <figure className="ticket" style={{ width: `${columnas + 2}ch` }} aria-label={documento.titulo}>
      {maquetar(documento, columnas).map((r, i) => (
        <div
          key={i}
          className={`ticket__renglon ticket__renglon--${r.tam}${r.negrita ? ' ticket__renglon--negrita' : ''}`}
          style={{ textAlign: r.alinear === 'izq' ? 'left' : r.alinear === 'der' ? 'right' : 'center' }}
        >
          {r.texto || ' '}
        </div>
      ))}
      <div className="ticket__corte" aria-hidden="true" />
    </figure>
  );
}
