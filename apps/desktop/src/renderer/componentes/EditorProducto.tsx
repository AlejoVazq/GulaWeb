import { useState, type FormEvent } from 'react';
import { formatearPrecio } from '@gula/shared';
import type { FilaSector, ProductoLocal } from '../../compartido/tipos';
import { llamar, mensajeDe } from '../gula';
import { centavosAPesos, parsearPesos } from '../pesos';

type Props = {
  producto: ProductoLocal | null;
  categoriaId: string;
  sectores: Pick<FilaSector, 'id' | 'nombre'>[];
  deshabilitado: boolean;
  onCerrar: () => void;
};

export function EditorProducto({ producto: p, categoriaId, sectores, deshabilitado, onCerrar }: Props) {
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(p?.descripcion ?? '');
  const [precio, setPrecio] = useState(p ? centavosAPesos(p.precio) : '');
  const [sectorId, setSectorId] = useState(p?.sectorId ?? sectores[0]?.id ?? '');
  const [etiquetas, setEtiquetas] = useState(p?.etiquetas.join(', ') ?? '');
  const [visible, setVisible] = useState(p?.visible ?? true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', min: '0', max: '1' });
  const [nuevaOpcion, setNuevaOpcion] = useState<Record<string, { nombre: string; recargo: string }>>({});

  const accion = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    }
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const centavos = parsearPesos(precio);
    if (centavos === null) return setError('Precio inválido');
    const datos = {
      categoriaId,
      nombre: nombre.trim(),
      precio: centavos,
      descripcion: descripcion.trim() || null,
      sectorId: sectorId || null,
      etiquetas: etiquetas.split(',').map((x) => x.trim()).filter(Boolean),
      visible,
    };
    const ok = await accion(() =>
      llamar('carta:editar', p ? { tipo: 'editarProducto', id: p.id, datos } : { tipo: 'crearProducto', datos }),
    );
    if (ok && !p) onCerrar();
  };

  return (
    <aside className="panel" aria-label={p ? `Editar ${p.nombre}` : 'Nuevo producto'}>
      <form className="formulario" onSubmit={guardar}>
        <h2>{p ? p.nombre : 'Nuevo producto'}</h2>
        <fieldset disabled={deshabilitado} className="sin-borde">
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} />
          </label>
          <label>
            Descripción
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400} rows={2} />
          </label>
          <label>
            Precio ($)
            <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} required />
          </label>
          <label>
            Sector (comanda)
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Sin sector</option>
              {sectores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Etiquetas (separadas por coma)
            <input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="vegano, sin TACC" />
          </label>
          <label className="fila">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible en la carta
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="fila">
          <button type="submit" className="boton boton--principal" disabled={deshabilitado}>
            Guardar
          </button>
          <button type="button" className="boton" onClick={onCerrar}>
            Cerrar
          </button>
          {p && (
            <button
              type="button"
              className="boton boton--peligro"
              disabled={deshabilitado}
              onClick={() => void accion(() => llamar('carta:editar', { tipo: 'borrarProducto', id: p.id })).then((ok) => ok && onCerrar())}
            >
              Borrar
            </button>
          )}
        </div>
      </form>

      {p && (
        <>
          <section className="bloque">
            <h3>Foto</h3>
            {p.foto && <img src={p.foto.chica} alt="" width={120} height={120} className="foto" />}
            <div className="fila">
              <button type="button" className="boton" disabled={deshabilitado} onClick={() => void accion(() => llamar('carta:subirFoto', { productoId: p.id }))}>
                {p.foto ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {p.foto && (
                <button type="button" className="boton" disabled={deshabilitado} onClick={() => void accion(() => llamar('carta:editar', { tipo: 'quitarFoto', productoId: p.id }))}>
                  Quitar
                </button>
              )}
            </div>
          </section>

          <section className="bloque">
            <h3>Opciones</h3>
            {p.grupos.map((g) => {
              const nueva = nuevaOpcion[g.id] ?? { nombre: '', recargo: '' };
              return (
                <div key={g.id} className="grupo">
                  <div className="fila">
                    <strong>{g.nombre}</strong>
                    <span className="suave">
                      mín {g.min} · máx {g.max}
                    </span>
                    <button type="button" className="enlace" disabled={deshabilitado} onClick={() => void accion(() => llamar('carta:editar', { tipo: 'borrarGrupo', id: g.id }))}>
                      Borrar grupo
                    </button>
                  </div>
                  <ul className="lista">
                    {g.opciones.map((o) => (
                      <li key={o.id} className="fila">
                        <span>{o.nombre}</span>
                        {o.recargo > 0 && <span className="suave">+{formatearPrecio(o.recargo)}</span>}
                        <label className="fila">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`${o.nombre} disponible`}
                            checked={o.disponible}
                            onChange={(e) => void accion(() => llamar('carta:disponibilidad', { opcionId: o.id, disponible: e.target.checked }))}
                          />
                          Disponible
                        </label>
                        <button type="button" className="enlace" disabled={deshabilitado} onClick={() => void accion(() => llamar('carta:editar', { tipo: 'borrarOpcion', id: o.id }))}>
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="fila">
                    <input aria-label={`Nueva opción en ${g.nombre}`} placeholder="Nueva opción" value={nueva.nombre} disabled={deshabilitado} onChange={(e) => setNuevaOpcion({ ...nuevaOpcion, [g.id]: { ...nueva, nombre: e.target.value } })} />
                    <input aria-label="Recargo ($)" placeholder="Recargo $" value={nueva.recargo} disabled={deshabilitado} onChange={(e) => setNuevaOpcion({ ...nuevaOpcion, [g.id]: { ...nueva, recargo: e.target.value } })} />
                    <button
                      type="button"
                      className="boton"
                      disabled={deshabilitado || !nueva.nombre.trim()}
                      onClick={() => {
                        const recargo = nueva.recargo ? parsearPesos(nueva.recargo) : 0;
                        if (recargo === null) return setError('Recargo inválido');
                        void accion(() => llamar('carta:editar', { tipo: 'crearOpcion', grupoId: g.id, datos: { nombre: nueva.nombre.trim(), recargo } })).then(
                          (ok) => ok && setNuevaOpcion({ ...nuevaOpcion, [g.id]: { nombre: '', recargo: '' } }),
                        );
                      }}
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="fila">
              <input aria-label="Nombre del grupo" placeholder="Nuevo grupo (ej. Tamaño)" value={nuevoGrupo.nombre} disabled={deshabilitado} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })} />
              <label className="fila">
                mín <input className="corto" type="number" min={0} max={20} value={nuevoGrupo.min} disabled={deshabilitado} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, min: e.target.value })} />
              </label>
              <label className="fila">
                máx <input className="corto" type="number" min={1} max={20} value={nuevoGrupo.max} disabled={deshabilitado} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, max: e.target.value })} />
              </label>
              <button
                type="button"
                className="boton"
                disabled={deshabilitado || !nuevoGrupo.nombre.trim()}
                onClick={() =>
                  void accion(() =>
                    llamar('carta:editar', {
                      tipo: 'crearGrupo',
                      productoId: p.id,
                      datos: { nombre: nuevoGrupo.nombre.trim(), min: Number(nuevoGrupo.min), max: Number(nuevoGrupo.max) },
                    }),
                  ).then((ok) => ok && setNuevoGrupo({ nombre: '', min: '0', max: '1' }))
                }
              >
                Agregar grupo
              </button>
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
