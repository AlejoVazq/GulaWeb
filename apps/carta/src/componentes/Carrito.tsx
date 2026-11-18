import { useState } from 'react';
import { formatearPrecio } from '@gula/shared';
import { totalCarrito, unidadesCarrito, type AccionCarrito, type ItemCarrito } from '../carrito';

type Props = { items: ItemCarrito[]; despachar: (a: AccionCarrito) => void };

export function Carrito({ items, despachar }: Props) {
  const [abierto, setAbierto] = useState(false);
  if (!items.length) return null;
  const total = formatearPrecio(totalCarrito(items));

  if (!abierto) {
    return (
      <button type="button" className="barra-pedido" onClick={() => setAbierto(true)}>
        Ver pedido ({unidadesCarrito(items)}) · {total}
      </button>
    );
  }
  return (
    <div className="hoja" role="dialog" aria-modal="true" aria-label="Tu pedido">
      <div className="hoja__contenido">
        <button type="button" className="hoja__cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">
          ×
        </button>
        <h2>Tu pedido</h2>
        <ul className="lista-pedido">
          {items.map((i) => (
            <li key={i.clave} className="lista-pedido__item">
              <div>
                <strong>{i.nombre}</strong>
                {i.resumenOpciones && <div className="lista-pedido__detalle">{i.resumenOpciones}</div>}
                {i.nota && <div className="lista-pedido__detalle">“{i.nota}”</div>}
                <div>{formatearPrecio(i.precioUnitario * i.cantidad)}</div>
              </div>
              <div className="cantidad">
                <button
                  type="button"
                  aria-label={`Restar ${i.nombre}`}
                  onClick={() => despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad - 1 })}
                >
                  −
                </button>
                <span>{i.cantidad}</span>
                <button
                  type="button"
                  aria-label={`Sumar ${i.nombre}`}
                  onClick={() => despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad + 1 })}
                >
                  +
                </button>
                <button
                  type="button"
                  className="enlace"
                  aria-label={`Quitar ${i.nombre}`}
                  onClick={() => despachar({ tipo: 'quitar', clave: i.clave })}
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="lista-pedido__total">Total: {total}</p>
        {/* El envío del pedido llega en la fase 4 (mesa abierta por el personal). */}
        <button type="button" className="boton-principal" disabled>
          Pedí al mozo que habilite la mesa
        </button>
      </div>
    </div>
  );
}
