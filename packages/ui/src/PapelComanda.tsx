import type { ReactNode } from 'react';
import { formatearPrecio } from '@gula/shared';
import type { Sello } from './sello';

export type LineaPapel = {
  id: string;
  cantidad: number;
  nombre: string;
  /** Centavos (cantidad × unitario ya calculado). */
  importe: number;
  /** Opciones y nota, ya resumidas. */
  detalle?: string;
  quitada?: boolean;
};

export type PropsPapel = {
  titulo: string;
  subtitulo?: string;
  local?: string;
  lineas: LineaPapel[];
  total?: number;
  sello?: Sello;
  compacto?: boolean;
  accionesLinea?: (l: LineaPapel) => ReactNode;
  children?: ReactNode;
  className?: string;
  'aria-label'?: string;
};

/**
 * El papel de comanda: lo que arma el cliente, lo que llega a la caja y el talón con su estado.
 * Solo presentación; los importes llegan calculados.
 */
export function PapelComanda({
  titulo,
  subtitulo,
  local,
  lineas,
  total,
  sello,
  compacto,
  accionesLinea,
  children,
  className,
  'aria-label': etiqueta,
}: PropsPapel) {
  const clases = ['papel', compacto && 'papel--compacto', className].filter(Boolean).join(' ');
  return (
    <article className={clases} aria-label={etiqueta ?? titulo}>
      <header className="papel__cabeza">
        {local && <p className="papel__local">{local}</p>}
        <p className="papel__titulo">{titulo}</p>
        {subtitulo && <p className="papel__subtitulo">{subtitulo}</p>}
        {sello && (
          <span className={`papel__sello papel__sello--${sello.tono}`} role="status">
            {sello.texto}
          </span>
        )}
      </header>
      <ol className="papel__lineas">
        {lineas.map((l) => (
          <li key={l.id} className={l.quitada ? 'papel__linea papel__linea--quitada' : 'papel__linea'}>
            <span className="papel__cant">{`${l.cantidad}×`}</span>
            <span className="papel__cuerpo">
              <em className="papel__nombre">{l.nombre}</em>
              {l.detalle && <span className="papel__detalle">{l.detalle}</span>}
            </span>
            <span className="papel__importe">{formatearPrecio(l.importe)}</span>
            {accionesLinea && <span className="papel__acciones">{accionesLinea(l)}</span>}
          </li>
        ))}
      </ol>
      {total !== undefined && (
        <p className="papel__total">
          <span>Total</span>
          <span className="papel__importe">{formatearPrecio(total)}</span>
        </p>
      )}
      {children && <footer className="papel__pie">{children}</footer>}
    </article>
  );
}
