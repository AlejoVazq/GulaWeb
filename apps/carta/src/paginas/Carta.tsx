import { useRef, useState } from 'react';
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
import { leerMarca } from '@gula/shared';
import { atributosTema, estiloMarca } from '../marca';
import { useCategoriaActiva } from '../componentes/useCategoriaActiva';
import { CabeceraLocal } from '../componentes/CabeceraLocal';
import { EsqueletoCarta } from '../componentes/EsqueletoCarta';

const MOTIVOS = {
  mesa_cerrada: 'Pedile a la moza que abra la mesa para pedir desde acá.',
  local_sin_conexion: 'Hoy hacé tu pedido a la moza.',
} as const;

/** Pantalla de un solo aviso, con la banda neutra de la carta. */
function PantallaAviso({ texto, children }: { texto: string; children?: React.ReactNode }) {
  return (
    <div className="carta" data-tema="comanda-bn" data-modo="auto">
      <header className="cabecera">
        <p className="cabecera__nombre">Carta</p>
      </header>
      <div className="pantalla-aviso">
        <p>{texto}</p>
        {children}
      </div>
    </div>
  );
}

export function Carta() {
  const { slug = '', token } = useParams();
  const { estado, reintentar } = useCarta(slug);
  const [elegido, setElegido] = useState<ProductoPublico | null>(null);
  const { items, despachar } = useCarrito(slug);
  const { estado: mesa, recargar: recargarMesa } = useMesa(token);
  const envio = useEnvioPedidos(token, mesa.tipo === 'lista' ? mesa.mesa.sesion : undefined);
  // Al mandar, el papel sale hacia arriba: cuando termina el corte, la vista lo acompaña hasta el talón.
  const talones = useRef<HTMLDivElement>(null);
  const irAlTalon = () => {
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    talones.current?.scrollIntoView?.({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  };
  const activa = useCategoriaActiva(
    estado.tipo === 'lista' ? estado.carta.categorias.map((c) => c.id) : [],
  );

  if (estado.tipo === 'cargando') return <EsqueletoCarta />;
  if (estado.tipo === 'no-encontrado') return <PantallaAviso texto="No encontramos este local." />;
  if (estado.tipo === 'error')
    return (
      <PantallaAviso texto="No pudimos cargar la carta.">
        <button type="button" className="boton-principal" onClick={reintentar}>
          Reintentar
        </button>
      </PantallaAviso>
    );

  const { carta } = estado;
  const infoMesa = mesa.tipo === 'lista' ? mesa.mesa : null;
  // Solo se arma la comanda desde una mesa que acepta pedidos (o mientras se confirma que la acepta).
  const puedePedir =
    Boolean(token) && mesa.tipo !== 'no-encontrada' && !(infoMesa && !infoMesa.aceptaPedidos);

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
        envio
          .enviar(
            items.map((i) => ({
              productoId: i.productoId,
              seleccion: i.seleccion,
              nota: i.nota,
              cantidad: i.cantidad,
            })),
          )
          .then((ok) => {
            if (!ok) recargarMesa();
            return ok;
          }),
      onEnviado: () => {
        despachar({ tipo: 'vaciar' });
        requestAnimationFrame(irAlTalon);
      },
    };
  }

  const marca = leerMarca(carta.local.marca);
  return (
    <div className="carta" {...atributosTema(marca)} style={estiloMarca(marca)}>
      <CabeceraLocal nombre={carta.local.nombre} marca={marca} mesa={infoMesa?.mesa.nombre} />
      <div inert={Boolean(elegido)}>
        {mesa.tipo === 'no-encontrada' && (
          <p className="aviso-mesa">Este QR ya no es válido. Pedile a la moza el de tu mesa.</p>
        )}
        {infoMesa?.motivo && <p className="aviso-mesa">{MOTIVOS[infoMesa.motivo]}</p>}
        {token && envio.pedidos.length > 0 && (
          <div className="pedidos-enviados" ref={talones}>
            {envio.pedidos.map((p) => (
              <EstadoPedido key={p.id} token={token} pedido={p} />
            ))}
          </div>
        )}
        <Categorias categorias={carta.categorias} activa={activa} />
        <main>
          {carta.categorias.map((c) => (
            <section
              key={c.id}
              id={anclaCategoria(c.id)}
              className={c.enHorario ? 'seccion' : 'seccion seccion--fuera-de-horario'}
              aria-labelledby={`t-${c.id}`}
            >
              <h2 id={`t-${c.id}`} className="seccion__banda">
                {c.nombre}
              </h2>
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
                    cantidadEnComanda={items.reduce(
                      (n, i) => (i.productoId === p.id ? n + i.cantidad : n),
                      0,
                    )}
                    onElegir={setElegido}
                    soloLectura={!puedePedir}
                    onAgregarRapido={(prod) =>
                      despachar({
                        tipo: 'agregar',
                        item: {
                          clave: '',
                          productoId: prod.id,
                          nombre: prod.nombre,
                          seleccion: {},
                          resumenOpciones: '',
                          nota: '',
                          cantidad: 1,
                          precioUnitario: prod.precio,
                        },
                      })
                    }
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
          soloLectura={!puedePedir}
          onAgregar={(item) => {
            despachar({ tipo: 'agregar', item });
            setElegido(null);
          }}
        />
      )}
      {!elegido && puedePedir && (
        <Carrito
          items={items}
          despachar={despachar}
          envio={datosEnvio}
          mesa={infoMesa?.mesa.nombre}
          local={carta.local.nombre}
          encima={
            token && infoMesa && infoMesa.motivo === null ? (
              <AvisosMesa token={token} onError={recargarMesa} />
            ) : undefined
          }
        />
      )}
    </div>
  );
}
