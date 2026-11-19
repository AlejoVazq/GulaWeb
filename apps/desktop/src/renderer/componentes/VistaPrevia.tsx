import { useEffect, useState } from 'react';
import type { VistaImpresion } from '../../compartido/ipc';
import { escuchar } from '../gula';
import { Ticket } from './Ticket';

const MAXIMO = 10;

/** Modo vista previa: cada ticket "impreso" se apila acá (el más nuevo arriba). */
export function VistaPrevia() {
  const [tickets, setTickets] = useState<(VistaImpresion & { n: number })[]>([]);
  useEffect(() => {
    let n = 0;
    return escuchar('impresion:vista', (d) =>
      setTickets((t) => [{ ...(d as VistaImpresion), n: n++ }, ...t].slice(0, MAXIMO)),
    );
  }, []);
  if (!tickets.length) return null;
  return (
    <aside className="vista-previa" aria-label="Vista previa de impresión">
      <div className="fila fila--entre">
        <strong>Vista previa de impresión</strong>
        <button type="button" className="boton" onClick={() => setTickets([])}>
          Cerrar
        </button>
      </div>
      {tickets.map((t) => (
        <Ticket key={t.n} documento={t.documento} columnas={t.columnas} />
      ))}
    </aside>
  );
}
