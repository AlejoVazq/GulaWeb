import { useCallback, useEffect, useState } from 'react';
import { formatearPrecio, puede } from '@gula/shared';
import type { EstadoSync, UsuarioPublico } from '../../compartido/ipc';
import type { CartaLocal, CategoriaLocal } from '../../compartido/tipos';
import { escuchar, llamar, mensajeDe } from '../gula';
import { EditorProducto } from '../componentes/EditorProducto';
import { IconoFlecha } from '@gula/ui';

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
    <fieldset className="ajustes-categoria" disabled={deshabilitado}>
      <legend className="sr-solo">Categoría</legend>
      <label className="campo ajustes-categoria__nombre">
        Categoría
        <input aria-label="Nombre de la categoría" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <div className="campo">
        <span>Horario</span>
        <span className="ajustes-categoria__horario">
          <input aria-label="Desde" type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <span aria-hidden="true">a</span>
          <input aria-label="Hasta" type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </span>
      </div>
      <button
        type="button"
        className="boton"
        onClick={() =>
          void editar({ tipo: 'editarCategoria', id: c.id, datos: { nombre: nombre.trim(), horario: desde && hasta ? { desde, hasta } : null } })
        }
      >
        Guardar categoría
      </button>
      <label className="interruptor">
        <input
          type="checkbox"
          role="switch"
          aria-label="Visible en la carta"
          checked={c.visible}
          onChange={(e) => void editar({ tipo: 'editarCategoria', id: c.id, datos: { visible: e.target.checked } })}
        />
        <span aria-hidden="true">{c.visible ? 'Visible' : 'Oculta'}</span>
      </label>
      <span className="ajustes-categoria__orden">
        <button type="button" className="boton boton--chico" disabled={indice === 0} onClick={() => mover(-1)} aria-label="Subir categoría">
          <IconoFlecha hacia="arriba" />
        </button>
        <button type="button" className="boton boton--chico" disabled={indice === total - 1} onClick={() => mover(1)} aria-label="Bajar categoría">
          <IconoFlecha hacia="abajo" />
        </button>
      </span>
      <button type="button" className="boton boton--chico boton--peligro" onClick={() => void editar({ tipo: 'borrarCategoria', id: c.id })}>
        Borrar
      </button>
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
    <div className={editor && cat && edicion ? 'carta carta--editando' : 'carta'}>
      <nav className="carta__categorias" aria-label="Categorías">
        <h2 className="columna__titulo">
          Categorías <span className="columna__cuenta">{carta.categorias.length}</span>
        </h2>
        <ul className="categorias">
          {carta.categorias.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="categorias__item"
                aria-current={c.id === cat?.id ? 'true' : undefined}
                onClick={() => {
                  setCategoriaId(c.id);
                  setEdicion(null);
                }}
              >
                <span className="categorias__nombre">{c.nombre}</span>
                {!c.visible && <span className="etiqueta categorias__oculta">Oculta</span>}
                <span className="categorias__cuenta">{c.productos.length}</span>
              </button>
            </li>
          ))}
        </ul>
        {editor && (
          <form
            className="categorias__nueva"
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
      </nav>

      <section className="carta__productos" aria-label={cat ? cat.nombre : 'Productos'}>
        {editor && sinConexion && <p className="aviso-linea">Necesitás conexión para editar la carta.</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {cat ? (
          <>
            <div className="herramientas">
              <h2 className="carta__titulo">{cat.nombre}</h2>
              {editor && (
                <button type="button" className="boton boton--linea" disabled={sinConexion} onClick={() => setEdicion({ tipo: 'nuevo' })}>
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
            {cat.productos.length ? (
              <div className="modulo modulo--tabla">
                <table className="tabla tabla--plana" aria-label={`Productos de ${cat.nombre}`}>
                  <thead>
                    <tr>
                      <th scope="col" className="tabla__texto">
                        Producto
                      </th>
                      <th scope="col">Precio</th>
                      <th scope="col" className="tabla__texto">
                        Stock
                      </th>
                      {editor && (
                        <th scope="col">
                          <span className="sr-solo">Editar</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.productos.map((p) => (
                      <tr key={p.id} className={p.disponible ? undefined : 'producto--sin-stock'}>
                        <td>
                          <span className="producto__nombre">{p.nombre}</span>
                          {!p.visible && <span className="etiqueta producto__oculto">Oculto</span>}
                          {p.descripcion && <span className="producto__descripcion">{p.descripcion}</span>}
                        </td>
                        <td>{formatearPrecio(p.precio)}</td>
                        <td className="tabla__texto">
                          <label className="interruptor">
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label={`${p.nombre} disponible`}
                              checked={p.disponible}
                              onChange={(e) =>
                                void llamar('carta:disponibilidad', { productoId: p.id, disponible: e.target.checked }).catch((x: unknown) => setError(mensajeDe(x)))
                              }
                            />
                            <span aria-hidden="true">{p.disponible ? 'Hay' : 'Sin stock'}</span>
                          </label>
                        </td>
                        {editor && (
                          <td>
                            <button type="button" className="boton boton--chico" aria-label={`Editar ${p.nombre}`} onClick={() => setEdicion({ tipo: 'producto', id: p.id })}>
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="columna__vacia">Esta categoría todavía no tiene productos.</p>
            )}
          </>
        ) : (
          <p className="columna__vacia">Todavía no hay categorías.</p>
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
