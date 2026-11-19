import type { CSSProperties, ReactNode } from 'react';
import { SECCIONES, type Seccion } from '../secciones';

/** El cartel de la sección, como el frente de un colectivo: color de la línea, placa y recorrido. */
export function Cartel({
  seccion,
  placa,
  titulo,
  resumen,
  children,
}: {
  seccion: Seccion;
  placa: string;
  /** Por defecto, el nombre de la sección. */
  titulo?: string;
  resumen?: string;
  children?: ReactNode;
}) {
  const s = SECCIONES[seccion];
  const estilo = { '--linea': s.color, '--placa': s.placa, '--placa-texto': s.textoPlaca } as CSSProperties;
  return (
    <header className={`cartel cartel--${seccion}`} style={estilo}>
      <span className="cartel__placa" aria-hidden="true">
        {placa}
      </span>
      <div className="cartel__recorrido">
        <h1 className="cartel__titulo">{titulo ?? s.nombre}</h1>
        {resumen && <p className="cartel__resumen">{resumen}</p>}
      </div>
      <div className="cartel__estado">{children}</div>
    </header>
  );
}
