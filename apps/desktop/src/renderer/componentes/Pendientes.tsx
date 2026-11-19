import { useState } from 'react';
import { formatearPrecio } from '@gula/shared';
import type { PedidoPendiente, Salon } from '../../compartido/salon';
import { llamar, mensajeDe } from '../gula';
import { hora } from '../formato';

const SUGERENCIAS = ['Sin stock', 'Cocina cerrada'];
const AVISOS = { llamar: 'Llamó a la moza', cuenta: 'Pidió la cuenta' } as const;

function TarjetaPendiente({ p }: { p: PedidoPendiente }) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(p.items.map((i) => [i.id, i.cantidad])),
  );
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = `${p.mesa?.nombre ?? 'Sin mesa'} · ${hora(p.creadoEn)}`;
  const total = p.items.reduce((t, i) => t + i.precioUnitario * (cantidades[i.id] ?? 0), 0);
  const vacio = p.items.every((i) => (cantidades[i.id] ?? 0) === 0);

  const hacer = async (fn: () => Promise<unknown>) => {
    setEnviando(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(mensajeDe(e));
      setEnviando(false);
    }
  };
  const ajustar = (itemId: string, delta: number) =>
    setCantidades((c) => ({ ...c, [itemId]: Math.max(0, Math.min(50, (c[itemId] ?? 0) + delta)) }));

  return (
    <article className="bloque pendiente" aria-label={titulo}>
      <strong>{titulo}</strong>
      <ul className="lista">
        {p.items.map((i) => {
          const n = cantidades[i.id] ?? 0;
          const detalle = [i.resumenOpciones, i.nota].filter(Boolean).join(' · ');
          return (
            <li key={i.id} className={n === 0 ? 'lista__item lista__item--quitado' : 'lista__item'}>
              <div>
                <div>{`${n}× ${i.nombre}`}</div>
                {detalle && <div className="suave">{detalle}</div>}
              </div>
              <div className="fila">
                <button
                  type="button"
                  className="boton boton--chico"
                  aria-label={`Quitar uno de ${i.nombre}`}
                  disabled={n === 0}
                  onClick={() => ajustar(i.id, -1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="boton boton--chico"
                  aria-label={`Sumar uno de ${i.nombre}`}
                  onClick={() => ajustar(i.id, 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="pedido__total">{formatearPrecio(total)}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!rechazando ? (
        <div className="fila">
          <button
            type="button"
            className="boton boton--principal"
            disabled={enviando || vacio}
            onClick={() =>
              void hacer(() =>
                llamar('salon:confirmar', {
                  pedidoId: p.id,
                  ajustes: p.items
                    .filter((i) => cantidades[i.id] !== i.cantidad)
                    .map((i) => ({ itemId: i.id, cantidad: cantidades[i.id] ?? 0 })),
                }),
              )
            }
          >
            Confirmar
          </button>
          <button type="button" className="boton boton--peligro" onClick={() => setRechazando(true)}>
            Rechazar
          </button>
        </div>
      ) : (
        <form
          className="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim()) void hacer(() => llamar('salon:rechazar', { pedidoId: p.id, motivo: motivo.trim() }));
          }}
        >
          <label>
            Motivo
            <input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="fila">
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" className="boton boton--chico" onClick={() => setMotivo(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="fila">
            <button type="submit" className="boton boton--peligro" disabled={!motivo.trim() || enviando}>
              Rechazar pedido
            </button>
            <button type="button" className="boton" onClick={() => setRechazando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

/** Bandeja fija: pedidos QR por confirmar y avisos de las mesas. */
export function Pendientes({ salon }: { salon: Salon }) {
  const total = salon.pendientes.length + salon.avisos.length;
  const [error, setError] = useState<string | null>(null);
  return (
    <aside className="bandeja" aria-labelledby="bandeja-titulo">
      <h2 id="bandeja-titulo" className="bandeja__titulo">
        Pendientes · {total}
      </h2>
      {!total && <p className="suave">Nada pendiente.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {salon.avisos.map((a) => (
        <div key={a.id} className="bloque bloque--aviso">
          <strong>{`${a.mesa.nombre} · ${AVISOS[a.tipo]}`}</strong>
          <span className="suave">{hora(a.creadoEn)}</span>
          <button
            type="button"
            className="boton boton--principal"
            onClick={() => void llamar('salon:atenderAviso', { avisoId: a.id }).catch((e: unknown) => setError(mensajeDe(e)))}
          >
            Atendido
          </button>
        </div>
      ))}
      {salon.pendientes.map((p) => (
        <TarjetaPendiente key={p.id} p={p} />
      ))}
    </aside>
  );
}
