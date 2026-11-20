import { useState } from 'react';
import type { PedidoPendiente, Salon } from '../../compartido/salon';
import { llamar, mensajeDe } from '../gula';
import { hora } from '../formato';
import { IconoMas, IconoMenos, PapelComanda, type LineaPapel } from '@gula/ui';

const SUGERENCIAS = ['Sin stock', 'Cocina cerrada'];
/** Un pedido largo entra plegado: el botón de aceptar no queda a mil píxeles. */
const PLEGAR_DESDE = 9;
const VISIBLES_PLEGADO = 6;
const AVISOS = { llamar: 'Llamó a la moza', cuenta: 'Pidió la cuenta' } as const;

function TarjetaPendiente({ p }: { p: PedidoPendiente }) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(p.items.map((i) => [i.id, i.cantidad])),
  );
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desplegado, setDesplegado] = useState(false);
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

  const lineas: LineaPapel[] = p.items.map((i) => ({
    id: i.id,
    cantidad: cantidades[i.id] ?? 0,
    nombre: i.nombre,
    importe: i.precioUnitario * (cantidades[i.id] ?? 0),
    detalle: [i.resumenOpciones, i.nota && `“${i.nota}”`].filter(Boolean).join(' · ') || undefined,
    quitada: (cantidades[i.id] ?? 0) === 0,
  }));
  const plegable = lineas.length >= PLEGAR_DESDE;
  return (
    <PapelComanda
      compacto
      aria-label={titulo}
      titulo={(p.mesa?.nombre ?? 'Sin mesa').toUpperCase()}
      subtitulo={hora(p.creadoEn)}
      lineas={plegable && !desplegado ? lineas.slice(0, VISIBLES_PLEGADO) : lineas}
      total={total}
      accionesLinea={(l) => (
        <>
          <button
            type="button"
            className="boton boton--chico"
            aria-label={`Quitar uno de ${l.nombre}`}
            disabled={l.cantidad === 0}
            onClick={() => ajustar(l.id, -1)}
          >
            <IconoMenos />
          </button>
          <button
            type="button"
            className="boton boton--chico"
            aria-label={`Sumar uno de ${l.nombre}`}
            onClick={() => ajustar(l.id, 1)}
          >
            <IconoMas />
          </button>
        </>
      )}
    >
      {plegable && (
        <button
          type="button"
          className="enlace papel__desplegar"
          onClick={() => setDesplegado((d) => !d)}
        >
          {desplegado ? 'Ver menos' : `Ver los ${lineas.length} renglones`}
        </button>
      )}
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
            Aceptar e imprimir
          </button>
          <button
            type="button"
            className="boton boton--peligro"
            onClick={() => setRechazando(true)}
          >
            Rechazar
          </button>
        </div>
      ) : (
        <form
          className="formulario"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim())
              void hacer(() => llamar('salon:rechazar', { pedidoId: p.id, motivo: motivo.trim() }));
          }}
        >
          <label>
            Motivo
            <input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="fila">
            {SUGERENCIAS.map((s) => (
              <button
                key={s}
                type="button"
                className="boton boton--chico"
                onClick={() => setMotivo(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="fila">
            <button
              type="submit"
              className="boton boton--peligro"
              disabled={!motivo.trim() || enviando}
            >
              Rechazar pedido
            </button>
            <button type="button" className="boton" onClick={() => setRechazando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </PapelComanda>
  );
}

/** Bandeja fija: pedidos QR por confirmar y avisos de las mesas. */
export function Pendientes({ salon }: { salon: Salon }) {
  const total = salon.pendientes.length + salon.avisos.length;
  const [error, setError] = useState<string | null>(null);
  return (
    <aside className="bandeja" aria-labelledby="bandeja-titulo">
      <h2 id="bandeja-titulo" className="bandeja__titulo">
        Entrando
        <span className="bandeja__contador" aria-label={`${total} sin atender`}>
          {total}
        </span>
      </h2>
      {!total && <p className="bandeja__vacia">Nada entrando por ahora.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {salon.avisos.map((a) => (
        <div
          key={a.id}
          className={
            a.tipo === 'cuenta' ? 'aviso-entrante aviso-entrante--cuenta' : 'aviso-entrante'
          }
        >
          <span className="aviso-entrante__texto">{`${a.mesa.nombre} · ${AVISOS[a.tipo]}`}</span>
          <button
            type="button"
            className="boton boton--chico"
            onClick={() =>
              void llamar('salon:atenderAviso', { avisoId: a.id }).catch((e: unknown) =>
                setError(mensajeDe(e)),
              )
            }
          >
            Atendido
          </button>
          <span className="aviso-entrante__hora">{hora(a.creadoEn)}</span>
        </div>
      ))}
      {salon.pendientes.map((p) => (
        <TarjetaPendiente key={p.id} p={p} />
      ))}
    </aside>
  );
}
