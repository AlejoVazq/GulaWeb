import { useState } from 'react';
import { formatearPrecio, puede, vuelto, type Rol } from '@gula/shared';
import type { PedidoDelivery } from '../../compartido/delivery';
import { llamar, mensajeDe } from '../gula';
import { useDelivery } from '../useDelivery';
import { centavosAPesos, parsearPesos } from '../pesos';
import { hora } from '../formato';
import { Anular } from '../componentes/Anular';
import { Cobrar } from '../componentes/Cobrar';
import { Dialogo } from '../componentes/Dialogo';
import { NuevoDelivery } from '../componentes/NuevoDelivery';

type Accion =
  | { tipo: 'salir'; p: PedidoDelivery }
  | { tipo: 'cobrar'; p: PedidoDelivery; entregar: boolean }
  | { tipo: 'anular'; p: PedidoDelivery };

/** Tablero de delivery: preparando → en camino → entregado; se cobra al entregar (o antes). */
export function Delivery({ rol }: { rol: Rol }) {
  const { tablero, envio, recargar } = useDelivery();
  const [nuevo, setNuevo] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [repartidor, setRepartidor] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeCobrar = puede(rol, 'cobro.registrar') === 'si';

  const hacer = (fn: () => Promise<unknown>, listo?: string) => {
    setError(null);
    void fn()
      .then(() => {
        setAccion(null);
        if (listo) setAviso(listo);
        recargar();
      })
      .catch((e: unknown) => setError(mensajeDe(e)));
  };
  const entregar = (p: PedidoDelivery) =>
    hacer(() => llamar('delivery:estado', { pedidoId: p.id, estado: 'entregado' }), `Pedido ${p.numero ?? ''} entregado.`);

  if (nuevo)
    return (
      <NuevoDelivery
        envioPorDefecto={envio}
        onCancelar={() => setNuevo(false)}
        onCreado={(numero) => {
          setNuevo(false);
          setAviso(`Delivery ${numero} cargado.`);
          recargar();
        }}
      />
    );

  const tarjeta = (p: PedidoDelivery) => {
    const r = p.delivery;
    const cancelado = p.estado === 'anulado';
    const cobrado = p.estado === 'cobrado';
    const v = vuelto(p.aCobrar, r.pagaCon);
    return (
      <article key={p.id} className="tarjeta delivery__tarjeta" aria-label={`Pedido ${p.numero ?? ''} · ${r.cliente.nombre}`}>
        <h3 className="fila fila--entre">
          <span>Pedido {p.numero ?? '-'}</span>
          <span className="suave">{hora(p.creadoEn)}</span>
        </h3>
        <p>
          <strong>{r.cliente.nombre}</strong>
          {r.cliente.telefono && <span className="suave"> · {r.cliente.telefono}</span>}
        </p>
        <p>
          {r.cliente.direccion}
          {r.cliente.referencias && <span className="suave"> ({r.cliente.referencias})</span>}
        </p>
        <p className="suave">{p.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', ')}</p>
        <p>
          <strong>{formatearPrecio(p.aCobrar)}</strong> <span className="suave">(envío {formatearPrecio(r.costoEnvio)})</span>{' '}
          {cancelado ? null : cobrado ? <span className="ok-texto">Cobrado</span> : <span className="error-texto">A cobrar</span>}
        </p>
        {!cobrado && !cancelado && r.pagaCon != null && (
          <p className="suave">
            Paga con {formatearPrecio(r.pagaCon)}
            {v != null && ` · Vuelto ${formatearPrecio(v)}`}
          </p>
        )}
        {r.repartidor && <p className="suave">Repartidor: {r.repartidor}</p>}
        {cancelado && <p className="error-texto">Cancelado: {p.motivoAnulacion ?? ''}</p>}
        {!cancelado && r.estado !== 'entregado' && (
          <div className="fila">
            {r.estado === 'preparando' && (
              <button type="button" className="boton" onClick={() => { setRepartidor(r.repartidor ?? ''); setAccion({ tipo: 'salir', p }); }}>
                Salió
              </button>
            )}
            {!cobrado && puedeCobrar && (
              <button type="button" className="boton" onClick={() => setAccion({ tipo: 'cobrar', p, entregar: false })}>
                Cobrar
              </button>
            )}
            <button
              type="button"
              className="boton boton--principal"
              disabled={!cobrado && !puedeCobrar}
              title={!cobrado && !puedeCobrar ? 'Un encargado tiene que cobrarlo antes' : undefined}
              onClick={() => (cobrado ? entregar(p) : setAccion({ tipo: 'cobrar', p, entregar: true }))}
            >
              Entregado
            </button>
            <button type="button" className="boton" onClick={() => hacer(() => llamar('impresion:delivery', { pedidoId: p.id }))}>
              Ticket
            </button>
            {!cobrado && puede(rol, 'pedido.anular') !== 'no' && (
              <button type="button" className="boton boton--peligro" onClick={() => setAccion({ tipo: 'anular', p })}>
                Anular
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  const columna = (titulo: string, lista: PedidoDelivery[]) => (
    <section className="delivery__columna" aria-label={titulo}>
      <h2 className="mesas__zona">
        {titulo} <span className="suave">({lista.length})</span>
      </h2>
      {lista.length ? lista.map(tarjeta) : <p className="suave">Nada por acá.</p>}
    </section>
  );

  return (
    <div className="delivery">
      <div className="fila fila--entre">
        <button type="button" className="boton boton--principal" onClick={() => { setAviso(null); setNuevo(true); }}>
          Nuevo delivery
        </button>
        {puede(rol, 'admin.configurar') === 'si' && <EnvioPorDefecto envio={envio} onGuardado={recargar} />}
      </div>
      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}
      {error && !accion && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!tablero ? (
        <p className="suave">Cargando…</p>
      ) : (
        <>
          <div className="delivery__tablero">
            {columna('Preparando', tablero.preparando)}
            {columna('En camino', tablero.enCamino)}
            {columna('Entregados hoy', tablero.entregados)}
          </div>
          {tablero.cancelados.length > 0 && (
            <details className="bloque">
              <summary>Cancelados hoy ({tablero.cancelados.length})</summary>
              {tablero.cancelados.map(tarjeta)}
            </details>
          )}
        </>
      )}

      {accion?.tipo === 'salir' && (
        <Dialogo titulo={`Sale el pedido ${accion.p.numero ?? ''}`} onCerrar={() => setAccion(null)}>
          <label className="campo">
            Repartidor
            <input value={repartidor} maxLength={60} onChange={(e) => setRepartidor(e.target.value)} />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="fila">
            <button
              type="button"
              className="boton boton--principal"
              onClick={() =>
                hacer(() =>
                  llamar('delivery:estado', {
                    pedidoId: accion.p.id,
                    estado: 'en_camino',
                    ...(repartidor.trim() ? { repartidor: repartidor.trim() } : {}),
                  }),
                )
              }
            >
              Confirmar salida
            </button>
            <button type="button" className="boton" onClick={() => setAccion(null)}>
              Cancelar
            </button>
          </div>
        </Dialogo>
      )}
      {accion?.tipo === 'cobrar' && (
        <Cobrar
          titulo={`delivery ${accion.p.numero ?? ''}`.trim()}
          subtotal={accion.p.aCobrar}
          destino={{ pedidoId: accion.p.id }}
          onCancelar={() => setAccion(null)}
          onListo={() => {
            const p = accion.p;
            setAccion(null);
            if (accion.entregar) entregar(p);
            else {
              setAviso(`Delivery ${p.numero ?? ''} cobrado.`);
              recargar();
            }
          }}
        />
      )}
      {accion?.tipo === 'anular' && (
        <Anular
          titulo={`Anular delivery ${accion.p.numero ?? ''}`}
          necesitaPin={puede(rol, 'pedido.anular') === 'con_autorizacion'}
          onCancelar={() => setAccion(null)}
          onConfirmar={async (motivo, autorizacion) => {
            await llamar('salon:anularPedido', { pedidoId: accion.p.id, motivo, autorizacion });
            setAccion(null);
            setAviso(`Delivery ${accion.p.numero ?? ''} anulado.`);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function EnvioPorDefecto({ envio, onGuardado }: { envio: number; onGuardado: () => void }) {
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const texto = valor ?? centavosAPesos(envio);
  const monto = parsearPesos(texto);
  return (
    <div className="fila">
      <label className="campo">
        Envío por defecto
        <input inputMode="decimal" value={texto} onChange={(e) => setValor(e.target.value)} />
      </label>
      <button
        type="button"
        className="boton"
        disabled={monto === null || valor === null}
        onClick={() =>
          void llamar('delivery:guardarConfig', { envio: monto! })
            .then(() => {
              setValor(null);
              setError(null);
              onGuardado();
            })
            .catch((e: unknown) => setError(mensajeDe(e)))
        }
      >
        Guardar
      </button>
      {error && <span className="error-texto">{error}</span>}
    </div>
  );
}
