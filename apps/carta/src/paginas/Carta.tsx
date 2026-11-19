import { useState } from 'react';
import { useParams } from 'react-router';
import type { ProductoPublico } from '@gula/shared';
import { useCarta } from '../useCarta';
import { Categorias, anclaCategoria } from '../componentes/Categorias';
import { ProductoCard } from '../componentes/ProductoCard';
import { DetalleProducto } from '../componentes/DetalleProducto';
import { Carrito } from '../componentes/Carrito';
import { useCarrito } from '../carrito';
import { useEnvioPedidos, useMesa } from '../mesa';
import { ErrorApi } from '../api';
import { EstadoPedido } from '../componentes/EstadoPedido';
import { AvisosMesa } from '../componentes/AvisosMesa';
import type { Envio } from '../componentes/Carrito';

const MOTIVOS = {
  mesa_cerrada: 'Pedile a la moza que habilite la mesa',
  local_sin_conexion: 'Hacé tu pedido a la moza',
} as const;

export function Carta() {
  const { slug = '', token } = useParams();
  const estado = useCarta(slug);
  const [elegido, setElegido] = useState<ProductoPublico | null>(null);
  const { items, despachar } = useCarrito(slug);
  const { estado: mesa, recargar: recargarMesa } = useMesa(token);
  const envio = useEnvioPedidos(token);

  if (estado.tipo === 'cargando') return <p className="aviso">Cargando la carta…</p>;
  if (estado.tipo === 'no-encontrado') return <p className="aviso">No encontramos este local</p>;
  if (estado.tipo === 'error')
    return <p className="aviso">No pudimos cargar la carta. Probá de nuevo en un momento.</p>;

  const { carta } = estado;
  const infoMesa = mesa.tipo === 'lista' ? mesa.mesa : null;

  let datosEnvio: Envio | undefined;
  if (token) {
    const e = envio.error;
    datosEnvio = {
      habilitado: !!infoMesa?.aceptaPedidos,
      motivo: infoMesa?.motivo
        ? MOTIVOS[infoMesa.motivo]
        : mesa.tipo === 'no-encontrada'
          ? 'Este QR ya no es válido'
          : 'Cargando la mesa…',
      enviando: envio.enviando,
      error: !e
        ? null
        : e instanceof ErrorApi
          ? e.message
          : 'No pudimos enviar tu pedido. Revisá tu conexión y probá de nuevo.',
      onEnviar: () =>
        void envio
          .enviar(
            items.map((i) => ({
              productoId: i.productoId,
              seleccion: i.seleccion,
              nota: i.nota,
              cantidad: i.cantidad,
            })),
          )
          .then((ok) => {
            if (ok) despachar({ tipo: 'vaciar' });
            else recargarMesa();
          }),
    };
  }

  return (
    <div className="carta">
      <header className="carta__encabezado">
        <h1>{carta.local.nombre}</h1>
        {infoMesa && <p className="carta__mesa">{infoMesa.mesa.nombre}</p>}
      </header>
      <div inert={Boolean(elegido)}>
        {mesa.tipo === 'no-encontrada' && (
          <p className="aviso">Este QR ya no es válido. Pedile a la moza el de tu mesa.</p>
        )}
        {token && envio.pedidos.length > 0 && (
          <div className="pedidos-enviados">
            {envio.pedidos.map((p) => (
              <EstadoPedido key={p.id} token={token} pedido={p} />
            ))}
          </div>
        )}
        {token && infoMesa && infoMesa.motivo === null && (
          <AvisosMesa token={token} onError={recargarMesa} />
        )}
        <Categorias categorias={carta.categorias} />
        <main>
          {carta.categorias.map((c) => (
            <section
              key={c.id}
              id={anclaCategoria(c.id)}
              className="seccion"
              aria-labelledby={`t-${c.id}`}
            >
              <h2 id={`t-${c.id}`}>{c.nombre}</h2>
              {!c.enHorario && c.horario && (
                <p className="seccion__horario">
                  Disponible de {c.horario.desde} a {c.horario.hasta}
                </p>
              )}
              <div className="seccion__productos">
                {c.productos.map((p) => (
                  <ProductoCard
                    key={p.id}
                    producto={p}
                    habilitado={c.enHorario}
                    onElegir={setElegido}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
      {elegido && (
        <DetalleProducto
          producto={elegido}
          onCerrar={() => setElegido(null)}
          onAgregar={(item) => {
            despachar({ tipo: 'agregar', item });
            setElegido(null);
          }}
        />
      )}
      {!elegido && <Carrito items={items} despachar={despachar} envio={datosEnvio} />}
    </div>
  );
}
