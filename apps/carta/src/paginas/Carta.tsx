import { useState } from 'react';
import { useParams } from 'react-router';
import type { ProductoPublico } from '@gula/shared';
import { useCarta } from '../useCarta';
import { Categorias, anclaCategoria } from '../componentes/Categorias';
import { ProductoCard } from '../componentes/ProductoCard';
import { DetalleProducto } from '../componentes/DetalleProducto';
import { Carrito } from '../componentes/Carrito';
import { useCarrito } from '../carrito';

export function Carta() {
  const { slug = '' } = useParams();
  const estado = useCarta(slug);
  const [elegido, setElegido] = useState<ProductoPublico | null>(null);
  const { items, despachar } = useCarrito(slug);

  if (estado.tipo === 'cargando') return <p className="aviso">Cargando la carta…</p>;
  if (estado.tipo === 'no-encontrado') return <p className="aviso">No encontramos este local</p>;
  if (estado.tipo === 'error')
    return <p className="aviso">No pudimos cargar la carta. Probá de nuevo en un momento.</p>;

  const { carta } = estado;
  return (
    <div className="carta">
      <header className="carta__encabezado">
        <h1>{carta.local.nombre}</h1>
      </header>
      <div inert={Boolean(elegido)}>
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
      {!elegido && <Carrito items={items} despachar={despachar} />}
    </div>
  );
}
