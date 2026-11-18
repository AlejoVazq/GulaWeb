import { useCallback, useEffect, useState } from 'react';
import { formatearPrecio, puede } from '@gula/shared';
import type { EstadoSync, UsuarioPublico } from '../../compartido/ipc';
import type { CartaLocal, CategoriaLocal } from '../../compartido/tipos';
import { escuchar, llamar, mensajeDe } from '../gula';
import { EditorProducto } from '../componentes/EditorProducto';

type Props = { usuario: UsuarioPublico; conexion: EstadoSync['conexion'] };
type Edicion = { tipo: 'nuevo' } | { tipo: 'producto'; id: string } | null;

function EditorCategoria({ c, total, indice, deshabilitado, onError, ids }: { c: CategoriaLocal; total: number; indice: number; deshabilitado: boolean; onError: (m: string) => void; ids: string[] }) {
  const [nombre, setNombre] = useState(c.nombre);
  const [desde, setDesde] = useState(c.horarioDesde ?? '');
  const [hasta, setHasta] = useState(c.horarioHasta ?? '');
  useEffect(() => {
    setNombre(c.nombre);
    setDesde(c.horarioDesde ?? '');
    setHasta(c.horarioHasta ?? '');
  }, [c]);
  const editar = (e: Parameters<typeof llamar<'carta:editar'>>[1]) => llamar('carta:editar', e).catch((x: unknown) => onError(mensajeDe(x)));
  const mover = (delta: number) => {
    const nuevos = [...ids];
    const [x] = nuevos.splice(indice, 1);
    nuevos.splice(indice + delta, 0, x!);
    void editar({ tipo: 'ordenarCategorias', ids: nuevos });
  };
  return (
    <fieldset className="bloque" disabled={deshabilitado}>
      <legend>Categoría</legend>
      <div className="fila">
        <input aria-label="Nombre de la categoría" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input aria-label="Desde" type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <input aria-label="Hasta" type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <button
          type="button"
          className="boton"
          onClick={() =>
            void editar({ tipo: 'editarCategoria', id: c.id, datos: { nombre: nombre.trim(), horario: desde && hasta ? { desde, hasta } : null } })
          }
        >
          Guardar categoría
        </button>
        <label className="fila">
          <input type="checkbox" checked={c.visible} onChange={(e) => void editar({ tipo: 'editarCategoria', id: c.id, datos: { visible: e.target.checked } })} /> Visible
        </label>
        <button type="button" className="boton" disabled={indice === 0} onClick={() => mover(-1)} aria-label="Subir categoría">
          ↑
        </button>
        <button type="button" className="boton" disabled={indice === total - 1} onClick={() => mover(1)} aria-label="Bajar categoría">
          ↓
        </button>
        <button type="button" className="boton boton--peligro" onClick={() => void editar({ tipo: 'borrarCategoria', id: c.id })}>
          Borrar
        </button>
      </div>
    </fieldset>
  );
}

export function Carta({ usuario, conexion }: Props) {
  const [carta, setCarta] = useState<CartaLocal | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevaCategoria, setNuevaCategoria] = useState('');

  const editor = puede(usuario.rol, 'carta.editar') === 'si';
  const sinConexion = conexion === 'sin-conexion';
  const recargar = useCallback(() => void llamar('carta:leer').then(setCarta), []);

  useEffect(() => {
    recargar();
    return escuchar('carta:cambio', recargar);
  }, [recargar]);

  if (!carta) return <p className="suave">Cargando carta…</p>;
  const cat = carta.categorias.find((c) => c.id === categoriaId) ?? carta.categorias[0] ?? null;
  const productoEditado = edicion?.tipo === 'producto' ? cat?.productos.find((p) => p.id === edicion.id) ?? null : null;

  return (
    <div className="carta">
      <aside className="carta__categorias">
        <h2>Categorías</h2>
        <ul className="lista">
          {carta.categorias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === cat?.id ? 'menu__item menu__item--activo' : 'menu__item'}
                onClick={() => {
                  setCategoriaId(c.id);
                  setEdicion(null);
                }}
              >
                {c.nombre} {!c.visible && <span className="suave">(oculta)</span>}
              </button>
            </li>
          ))}
        </ul>
        {editor && (
          <form
            className="fila"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nuevaCategoria.trim()) return;
              void llamar('carta:editar', { tipo: 'crearCategoria', datos: { nombre: nuevaCategoria.trim() } })
                .then(() => setNuevaCategoria(''))
                .catch((x: unknown) => setError(mensajeDe(x)));
            }}
          >
            <input aria-label="Nueva categoría" placeholder="Nueva categoría" value={nuevaCategoria} disabled={sinConexion} onChange={(e) => setNuevaCategoria(e.target.value)} />
            <button type="submit" className="boton" disabled={sinConexion}>
              Agregar
            </button>
          </form>
        )}
      </aside>

      <section className="carta__productos">
        {editor && sinConexion && <p className="aviso">Necesitás conexión para editar la carta.</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {cat ? (
          <>
            <div className="fila">
              <h2>{cat.nombre}</h2>
              {editor && (
                <button type="button" className="boton boton--principal" disabled={sinConexion} onClick={() => setEdicion({ tipo: 'nuevo' })}>
                  Nuevo producto
                </button>
              )}
            </div>
            {editor && (
              <EditorCategoria
                c={cat}
                indice={carta.categorias.indexOf(cat)}
                total={carta.categorias.length}
                ids={carta.categorias.map((c) => c.id)}
                deshabilitado={sinConexion}
                onError={setError}
              />
            )}
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Disponible</th>
                  {editor && <th />}
                </tr>
              </thead>
              <tbody>
                {cat.productos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.nombre} {!p.visible && <span className="suave">(oculto)</span>}
                    </td>
                    <td>{formatearPrecio(p.precio)}</td>
                    <td>
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`${p.nombre} disponible`}
                        checked={p.disponible}
                        onChange={(e) =>
                          void llamar('carta:disponibilidad', { productoId: p.id, disponible: e.target.checked }).catch((x: unknown) => setError(mensajeDe(x)))
                        }
                      />
                    </td>
                    {editor && (
                      <td>
                        <button type="button" className="enlace" aria-label={`Editar ${p.nombre}`} onClick={() => setEdicion({ tipo: 'producto', id: p.id })}>
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="suave">Todavía no hay categorías.</p>
        )}
      </section>

      {editor && cat && edicion && (
        <EditorProducto
          key={edicion.tipo === 'producto' ? edicion.id : 'nuevo'}
          producto={productoEditado}
          categoriaId={cat.id}
          sectores={carta.sectores}
          deshabilitado={sinConexion}
          onCerrar={() => setEdicion(null)}
        />
      )}
    </div>
  );
}
