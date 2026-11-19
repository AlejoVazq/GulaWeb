import { useEffect, useState } from 'react';
import { formatearPrecio } from '@gula/shared';
import { useDialogo } from './useDialogo';
import { totalCarrito, unidadesCarrito, type AccionCarrito, type ItemCarrito } from '../carrito';

/** Envío desde la mesa (sin token, la carta es de solo lectura). */
export type Envio = {
  habilitado: boolean;
  /** Texto del botón cuando no se puede enviar. */
  motivo: string;
  enviando: boolean;
  error: string | null;
  onEnviar: () => void;
};

type Props = { items: ItemCarrito[]; despachar: (a: AccionCarrito) => void; envio?: Envio };

export function Carrito({ items, despachar, envio }: Props) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!items.length) setAbierto(false);
  }, [items.length]);
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
    <HojaPedido
      items={items}
      despachar={despachar}
      envio={envio}
      total={total}
      onCerrar={() => setAbierto(false)}
    />
  );
}

function HojaPedido({
  items,
  despachar,
  envio,
  total,
  onCerrar,
}: Props & { total: string; onCerrar: () => void }) {
  const dialogo = useDialogo<HTMLDivElement>(onCerrar);
  return (
    <div className="hoja" role="dialog" aria-modal="true" aria-label="Tu pedido" ref={dialogo}>
      <div className="hoja__contenido">
        <button type="button" className="hoja__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
        <h2>Tu pedido</h2>
        <ul className="lista-pedido">
          {items.map((i) => (
            <li key={i.clave} className="lista-pedido__item">
              <div>
                <strong>{i.nombre}</strong>
                {i.resumenOpciones && (
                  <div className="lista-pedido__detalle">{i.resumenOpciones}</div>
                )}
                {i.nota && <div className="lista-pedido__detalle">“{i.nota}”</div>}
                <div>{formatearPrecio(i.precioUnitario * i.cantidad)}</div>
              </div>
              <div className="cantidad">
                <button
                  type="button"
                  aria-label={`Restar ${i.nombre}`}
                  onClick={() =>
                    despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad - 1 })
                  }
                >
                  −
                </button>
                <span>{i.cantidad}</span>
                <button
                  type="button"
                  aria-label={`Sumar ${i.nombre}`}
                  onClick={() =>
                    despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad + 1 })
                  }
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
        {envio?.error && (
          <p className="hoja__error" role="alert">
            {envio.error}
          </p>
        )}
        {!envio ? (
          <button type="button" className="boton-principal" disabled>
            Pedí al mozo que habilite la mesa
          </button>
        ) : envio.habilitado ? (
          <button
            type="button"
            className="boton-principal"
            disabled={envio.enviando}
            aria-busy={envio.enviando}
            onClick={envio.onEnviar}
          >
            {envio.enviando ? 'Enviando…' : `Enviar pedido · ${total}`}
          </button>
        ) : (
          <button type="button" className="boton-principal" disabled>
            {envio.motivo}
          </button>
        )}
      </div>
    </div>
  );
}
