import { useCallback, useEffect, useState } from 'react';
import { formatearPrecio } from '@gula/shared';
import type { DetalleMesa as Detalle, Pedido } from '../../compartido/salon';
import { escuchar, llamar, mensajeDe } from '../gula';
import { TomarPedido } from '../componentes/TomarPedido';
import { hora } from '../formato';

const ESTADOS: Record<Pedido['estado'], string> = {
  pendiente: 'Pendiente de confirmar',
  confirmado: 'Confirmado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};
const AVISOS = { llamar: 'Llamó a la moza', cuenta: 'Pidió la cuenta' } as const;

function TarjetaPedido({ p }: { p: Pedido }) {
  const titulo = p.numero ? `Pedido ${p.numero}` : 'Pedido sin número';
  return (
    <article className={`bloque pedido pedido--${p.estado}`} aria-label={titulo}>
      <div className="fila fila--entre">
        <strong>{titulo}</strong>
        <span className="suave">
          {hora(p.creadoEn)} · {p.origen === 'qr' ? 'QR' : 'Moza'}
        </span>
        <span className={`etiqueta etiqueta--${p.estado === 'pendiente' ? 'pendiente' : 'abierta'}`}>{ESTADOS[p.estado]}</span>
      </div>
      <ul className="lista">
        {p.items.map((i) => {
          const detalle = [i.resumenOpciones, i.nota].filter(Boolean).join(' · ');
          return (
            <li key={i.id} className="lista__item">
              <div>
                <div>{`${i.cantidad}× ${i.nombre}`}</div>
                {detalle && <div className="suave">{detalle}</div>}
              </div>
              <span>{formatearPrecio(i.precioUnitario * i.cantidad)}</span>
            </li>
          );
        })}
      </ul>
      {p.motivoRechazo && <p className="suave">Motivo: {p.motivoRechazo}</p>}
      <p className="pedido__total">{formatearPrecio(p.total)}</p>
    </article>
  );
}

export function DetalleMesa({ mesaId, onVolver }: { mesaId: string; onVolver: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [tomando, setTomando] = useState(false);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    void llamar('salon:mesa', mesaId)
      .then(setD)
      .catch((e: unknown) => setError(mensajeDe(e)));
  }, [mesaId]);
  useEffect(() => {
    cargar();
    return escuchar('salon:cambio', cargar);
  }, [cargar]);

  const intentar = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    }
  };

  if (!d) return <p className="suave">{error ?? 'Cargando…'}</p>;
  const { mesa, sesion } = d;

  if (!sesion)
    return (
      <div className="detalle">
        <h1 className="titulo">{mesa.nombre}</h1>
        <p className="suave">La mesa está libre.</p>
        <button type="button" className="boton" onClick={onVolver}>
          Volver a las mesas
        </button>
      </div>
    );

  if (tomando)
    return (
      <TomarPedido
        titulo={mesa.nombre}
        onCancelar={() => setTomando(false)}
        onEnviar={async (items) => {
          const r = await llamar('salon:crearPedido', { origen: 'manual', sesionId: sesion.id, items });
          setTomando(false);
          setAviso(`Pedido ${r.numero} enviado.`);
        }}
      />
    );

  const vigentes = d.pedidos.filter((p) => p.estado === 'confirmado');
  const total = vigentes.reduce((t, p) => t + p.total, 0);

  return (
    <div className="detalle">
      <div className="fila fila--entre">
        <button type="button" className="boton" onClick={onVolver}>
          ← Mesas
        </button>
        <h1 className="titulo">{mesa.nombre}</h1>
        <span className="suave">
          Abierta {hora(sesion.abiertaEn)}
          {sesion.comensales ? ` · ${sesion.comensales} personas` : ''}
          {sesion.estado === 'cuenta_pedida' ? ' · pidió la cuenta' : ''}
        </span>
      </div>

      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {d.avisos.map((a) => (
        <div key={a.id} className="bloque bloque--aviso fila fila--entre">
          <strong>
            {AVISOS[a.tipo]} · {hora(a.creadoEn)}
          </strong>
          <button
            type="button"
            className="boton boton--principal"
            aria-label={`Atendido: ${AVISOS[a.tipo].toLowerCase()}`}
            onClick={() => void intentar(() => llamar('salon:atenderAviso', { avisoId: a.id }))}
          >
            Atendido
          </button>
        </div>
      ))}

      <div className="fila">
        <button type="button" className="boton boton--principal" onClick={() => setTomando(true)}>
          Nuevo pedido
        </button>
        {!confirmandoCierre && (
          <button type="button" className="boton" onClick={() => setConfirmandoCierre(true)}>
            Cerrar mesa
          </button>
        )}
      </div>
      {confirmandoCierre && (
        <div className="bloque fila" role="group" aria-label="Confirmar cierre">
          <span>¿Cerrar {mesa.nombre}? Se libera para los próximos clientes.</span>
          <button
            type="button"
            className="boton boton--peligro"
            onClick={() =>
              void intentar(() => llamar('salon:cerrarMesa', { sesionId: sesion.id })).then((ok) => ok && onVolver())
            }
          >
            Sí, cerrar
          </button>
          <button type="button" className="boton" onClick={() => setConfirmandoCierre(false)}>
            Cancelar
          </button>
        </div>
      )}

      {!d.pedidos.length && <p className="suave">Todavía no hay pedidos en esta mesa.</p>}
      {d.pedidos.map((p) => (
        <TarjetaPedido key={p.id} p={p} />
      ))}
      <p>
        <strong>Total de la mesa {formatearPrecio(total)}</strong>
      </p>
    </div>
  );
}
