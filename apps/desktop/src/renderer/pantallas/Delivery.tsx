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
import { PapelComanda, selloDeEstado, type LineaPapel } from '@gula/ui';

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
    const lineas: LineaPapel[] = [
      ...p.items.map((i) => ({
        id: i.id,
        cantidad: i.cantidad,
        nombre: i.nombre,
        importe: i.precioUnitario * i.cantidad,
        detalle: [i.resumenOpciones, i.nota].filter(Boolean).join(' · ') || undefined,
        quitada: i.anulado,
      })),
      { id: 'envio', cantidad: 1, nombre: 'Envío', importe: r.costoEnvio },
    ];
    // La acción que lleva el pedido a la etapa siguiente va primero y en el color de la línea.
    const salio = r.estado === 'preparando' && (
      <button
        type="button"
        className="boton boton--linea"
        onClick={() => {
          setRepartidor(r.repartidor ?? '');
          setAccion({ tipo: 'salir', p });
        }}
      >
        Salió
      </button>
    );
    const entregado = (
      <button
        type="button"
        className={salio ? 'boton boton--chico' : 'boton boton--linea'}
        disabled={!cobrado && !puedeCobrar}
        title={!cobrado && !puedeCobrar ? 'Un encargado tiene que cobrarlo antes' : undefined}
        onClick={() => (cobrado ? entregar(p) : setAccion({ tipo: 'cobrar', p, entregar: true }))}
      >
        Entregado
      </button>
    );
    return (
      <PapelComanda
        key={p.id}
        compacto
        className="delivery__papel"
        aria-label={`Pedido ${p.numero ?? ''} · ${r.cliente.nombre}`}
        titulo={`DELIVERY ${p.numero ?? '-'}`}
        subtitulo={hora(p.creadoEn)}
        lineas={lineas}
        total={p.aCobrar}
        sello={cancelado ? selloDeEstado('anulado') : undefined}
      >
        <div className="reparto">
          <p className="reparto__cliente">
            <strong>{r.cliente.nombre}</strong>
            {r.cliente.telefono && <span className="cifra"> · {r.cliente.telefono}</span>}
          </p>
          <p>{r.cliente.direccion}</p>
          {r.cliente.referencias && <p className="suave">{r.cliente.referencias}</p>}
          {!cancelado && (
            <p className="reparto__pago">
              <span className={cobrado ? 'etiqueta etiqueta--ok' : 'etiqueta etiqueta--cuenta'}>{cobrado ? 'Cobrado' : 'A cobrar'}</span>
              {!cobrado && r.pagaCon != null && (
                <span className="cifra">
                  Paga con {formatearPrecio(r.pagaCon)}
                  {v != null && ` · vuelto ${formatearPrecio(v)}`}
                </span>
              )}
            </p>
          )}
          {r.repartidor && <p className="suave">Repartidor: {r.repartidor}</p>}
          {cancelado && <p className="error-texto">Cancelado: {p.motivoAnulacion ?? ''}</p>}
        </div>
        {!cancelado && r.estado !== 'entregado' && (
          <div className="reparto__acciones">
            {salio || entregado}
            <div className="fila">
              {salio && entregado}
              {!cobrado && puedeCobrar && (
                <button type="button" className="boton boton--chico" onClick={() => setAccion({ tipo: 'cobrar', p, entregar: false })}>
                  Cobrar
                </button>
              )}
              <button type="button" className="boton boton--chico" onClick={() => hacer(() => llamar('impresion:delivery', { pedidoId: p.id }))}>
                Ticket
              </button>
              {!cobrado && puede(rol, 'pedido.anular') !== 'no' && (
                <button type="button" className="boton boton--chico boton--peligro" onClick={() => setAccion({ tipo: 'anular', p })}>
                  Anular
                </button>
              )}
            </div>
          </div>
        )}
      </PapelComanda>
    );
  };

  const columna = (id: string, titulo: string, lista: PedidoDelivery[], vacio: string) => (
    <section className="delivery__columna" aria-labelledby={id}>
      <h2 id={id} className="columna__titulo">
        {titulo} <span className="columna__cuenta" aria-hidden="true">{lista.length}</span>
      </h2>
      {lista.length ? lista.map(tarjeta) : <p className="columna__vacia">{vacio}</p>}
    </section>
  );

  return (
    <div className="delivery">
      <div className="herramientas">
        <button type="button" className="boton boton--linea" onClick={() => { setAviso(null); setNuevo(true); }}>
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
            {columna('col-preparando', 'Preparando', tablero.preparando, 'Nada en la cocina.')}
            {columna('col-en-camino', 'En camino', tablero.enCamino, 'Nadie en la calle.')}
            {columna('col-entregados', 'Entregados hoy', tablero.entregados, 'Todavía no se entregó nada.')}
          </div>
          {tablero.cancelados.length > 0 && (
            <details className="delivery__cancelados">
              <summary>Cancelados hoy ({tablero.cancelados.length})</summary>
              <div className="delivery__tablero">{tablero.cancelados.map(tarjeta)}</div>
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
    <div className="envio-defecto">
      <label className="envio-defecto__campo">
        Envío por defecto
        <span className="envio-defecto__monto">
          <span aria-hidden="true">$</span>
          <input inputMode="decimal" className="cifra" value={texto} onChange={(e) => setValor(e.target.value)} />
        </span>
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
