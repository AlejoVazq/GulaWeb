import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatearPrecio } from '@gula/shared';
import { PapelComanda, type LineaPapel } from '@gula/ui';
import { useDialogo } from './useDialogo';
import { IconoCerrar, IconoMas, IconoMenos } from './Iconos';
import { totalCarrito, unidadesCarrito, type AccionCarrito, type ItemCarrito } from '../carrito';

/** Envío desde la mesa (sin token, la carta es de solo lectura). */
export type Envio = {
  habilitado: boolean;
  /** Texto del botón cuando no se puede enviar. */
  motivo: string;
  enviando: boolean;
  error: string | null;
  /** Manda la comanda; resuelve true si la barra la recibió. */
  onEnviar: () => Promise<boolean>;
  /** Después del corte: vaciar la comanda. */
  onEnviado: () => void;
};

type Props = {
  items: ItemCarrito[];
  despachar: (a: AccionCarrito) => void;
  envio?: Envio;
  mesa?: string;
  local: string;
  /** Lo que va encima del papel fijo (avisos a la moza). */
  encima?: ReactNode;
};

const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const items1 = (n: number) => `${n} ${n === 1 ? 'ítem' : 'ítems'}`;
const hora = () => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

export function Carrito({ items, despachar, envio, mesa, local, encima }: Props) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    if (!items.length) setAbierto(false);
  }, [items.length]);
  if (!items.length && !encima) return null;
  const total = formatearPrecio(totalCarrito(items));
  const unidades = unidadesCarrito(items);

  return (
    <>
      {!abierto && (
        <div className="comanda-fija">
          {encima}
          {items.length > 0 && (
            <button
              type="button"
              className="papel-boton"
              aria-label={`Ver mi pedido: ${items1(unidades)}, ${total}`}
              onClick={() => setAbierto(true)}
            >
              <span className="papel papel--compacto">
                <span className="papel-resumen">
                  <span className="papel-resumen__linea1">
                    <span>{mesa ? `Comanda · ${mesa}` : 'Comanda'}</span>
                    <span>{items1(unidades)}</span>
                  </span>
                  <span className="papel-resumen__accion">Ver mi pedido</span>
                  <span className="papel-resumen__total">{total}</span>
                </span>
              </span>
            </button>
          )}
        </div>
      )}
      {abierto && items.length > 0 && (
        <HojaComanda
          items={items}
          despachar={despachar}
          envio={envio}
          mesa={mesa}
          local={local}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function HojaComanda({
  items,
  despachar,
  envio,
  mesa,
  local,
  onCerrar,
}: Omit<Props, 'encima'> & { onCerrar: () => void }) {
  const dialogo = useDialogo<HTMLDivElement>(onCerrar);
  const [cortando, setCortando] = useState(false);
  const enCurso = useRef(false);
  const terminado = useRef(false);

  const alTerminar = useRef<() => void>(() => {});
  alTerminar.current = () => {
    if (terminado.current) return;
    terminado.current = true;
    envio?.onEnviado();
    onCerrar();
  };
  const terminar = () => alTerminar.current();

  // Si animationend no llega (pestaña oculta), el corte igual termina.
  useEffect(() => {
    if (!cortando) return;
    const t = setTimeout(() => alTerminar.current(), 700);
    return () => clearTimeout(t);
  }, [cortando]);

  const mandar = async () => {
    if (!envio || enCurso.current) return;
    enCurso.current = true;
    const ok = await envio.onEnviar();
    enCurso.current = false;
    if (!ok) return;
    if (reducido()) terminar();
    else setCortando(true);
  };

  const lineas: LineaPapel[] = items.map((i) => ({
    id: i.clave,
    cantidad: i.cantidad,
    nombre: i.nombre,
    importe: i.precioUnitario * i.cantidad,
    detalle: [i.resumenOpciones, i.nota && `“${i.nota}”`].filter(Boolean).join(' · ') || undefined,
  }));
  const porClave = new Map(items.map((i) => [i.clave, i]));

  let boton: ReactNode;
  if (!envio) {
    boton = (
      <button type="button" className="boton-principal" disabled>
        Pedí al mozo que habilite la mesa
      </button>
    );
  } else if (!envio.habilitado) {
    boton = (
      <button type="button" className="boton-principal" disabled>
        {envio.motivo}
      </button>
    );
  } else {
    boton = (
      <button
        type="button"
        className="boton-principal"
        disabled={envio.enviando || cortando}
        aria-busy={envio.enviando}
        onClick={() => void mandar()}
      >
        {envio.enviando ? 'Mandando…' : envio.error ? 'Reintentar' : 'Mandar a la barra'}
      </button>
    );
  }

  return (
    <div className="hoja hoja--comanda" role="dialog" aria-modal="true" aria-label="Tu comanda" ref={dialogo}>
      <div className="hoja__contenido">
        <button type="button" className="hoja__cerrar" onClick={onCerrar} aria-label="Cerrar">
          <IconoCerrar />
        </button>
        <div
          className={cortando ? 'comanda-abierta papel--cortando' : 'comanda-abierta'}
          onAnimationEnd={(e) => e.animationName === 'papel-corte' && terminar()}
        >
          <PapelComanda
            local={local}
            titulo={mesa ? mesa.toUpperCase() : 'COMANDA'}
            subtitulo={`${hora()} · COMANDA`}
            lineas={lineas}
            total={totalCarrito(items)}
            accionesLinea={(l) => {
              const i = porClave.get(l.id)!;
              return (
                <span className="cantidad">
                  <button
                    type="button"
                    aria-label={`Restar ${i.nombre}`}
                    onClick={() => despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad - 1 })}
                  >
                    <IconoMenos />
                  </button>
                  <button
                    type="button"
                    aria-label={`Sumar ${i.nombre}`}
                    onClick={() => despachar({ tipo: 'cantidad', clave: i.clave, cantidad: i.cantidad + 1 })}
                  >
                    <IconoMas />
                  </button>
                  <button
                    type="button"
                    className="enlace"
                    aria-label={`Quitar ${i.nombre}`}
                    onClick={() => despachar({ tipo: 'quitar', clave: i.clave })}
                  >
                    Quitar
                  </button>
                </span>
              );
            }}
          >
            {envio?.error && (
              <p className="comanda__error" role="alert">
                {envio.error}
              </p>
            )}
            {boton}
            <p className="comanda__ayuda">Lo que mandes sale impreso en la barra.</p>
          </PapelComanda>
        </div>
      </div>
    </div>
  );
}
