import { useMemo, useState } from 'react';
import {
  formatearPrecio,
  precioUnitario,
  validarSeleccion,
  type GrupoPublico,
  type ProductoPublico,
  type Seleccion,
} from '@gula/shared';
import type { ItemCarrito } from '../carrito';

type Props = {
  producto: ProductoPublico;
  onAgregar: (item: ItemCarrito) => void;
  onCerrar: () => void;
};

const MAX_NOTA = 140;

function resumen(p: ProductoPublico, sel: Seleccion): string {
  return p.grupos
    .flatMap((g) => (sel[g.id] ?? []).map((id) => g.opciones.find((o) => o.id === id)?.nombre ?? ''))
    .filter(Boolean)
    .join(', ');
}

function Grupo({ grupo, elegidas, onCambiar }: { grupo: GrupoPublico; elegidas: string[]; onCambiar: (ids: string[]) => void }) {
  const unica = grupo.max === 1;
  const lleno = elegidas.length >= grupo.max;
  const indicacion = grupo.min > 0 ? (unica ? 'Obligatorio' : `Elegí al menos ${grupo.min}`) : `Opcional · hasta ${grupo.max}`;
  return (
    <fieldset className="grupo">
      <legend>
        {grupo.nombre} <span className="grupo__indicacion">{indicacion}</span>
      </legend>
      {grupo.opciones.map((o) => {
        const marcada = elegidas.includes(o.id);
        const deshabilitada = !o.disponible || (!unica && lleno && !marcada);
        return (
          <label key={o.id} className="opcion">
            <input
              type={unica ? 'radio' : 'checkbox'}
              name={grupo.id}
              checked={marcada}
              disabled={deshabilitada}
              onChange={() => {
                if (unica) onCambiar([o.id]);
                else onCambiar(marcada ? elegidas.filter((x) => x !== o.id) : [...elegidas, o.id]);
              }}
            />
            <span>{o.nombre}</span>
            {!o.disponible && <span className="opcion__extra">Sin stock</span>}
            {o.disponible && o.recargo > 0 && <span className="opcion__extra">+{formatearPrecio(o.recargo)}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

export function DetalleProducto({ producto: p, onAgregar, onCerrar }: Props) {
  const [seleccion, setSeleccion] = useState<Seleccion>({});
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');

  const validacion = useMemo(() => validarSeleccion(p, seleccion), [p, seleccion]);
  const unitario = precioUnitario(p, seleccion);

  return (
    <div className="hoja" role="dialog" aria-modal="true" aria-label={p.nombre}>
      <div className="hoja__contenido">
        <button type="button" className="hoja__cerrar" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
        {p.foto && <img className="hoja__foto" src={p.foto.grande} alt="" />}
        <h2>{p.nombre}</h2>
        {p.descripcion && <p className="hoja__desc">{p.descripcion}</p>}
        <p className="hoja__precio">{formatearPrecio(p.precio)}</p>

        {p.grupos.map((g) => (
          <Grupo
            key={g.id}
            grupo={g}
            elegidas={seleccion[g.id] ?? []}
            onCambiar={(ids) => setSeleccion((s) => ({ ...s, [g.id]: ids }))}
          />
        ))}

        <label className="nota">
          <span>Nota para la cocina</span>
          <textarea
            value={nota}
            maxLength={MAX_NOTA}
            rows={2}
            placeholder="Ej.: sin cebolla"
            onChange={(e) => setNota(e.target.value)}
          />
        </label>

        <div className="cantidad" aria-label="Cantidad">
          <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} disabled={cantidad <= 1}>
            −
          </button>
          <span aria-live="polite">{cantidad}</span>
          <button type="button" onClick={() => setCantidad((c) => Math.min(50, c + 1))}>
            +
          </button>
        </div>

        {!validacion.ok && <p className="hoja__error">{validacion.errores[0]}</p>}
        <button
          type="button"
          className="boton-principal"
          disabled={!validacion.ok}
          onClick={() =>
            onAgregar({
              clave: '',
              productoId: p.id,
              nombre: p.nombre,
              seleccion: Object.fromEntries(Object.entries(seleccion).filter(([, ids]) => ids.length > 0)),
              resumenOpciones: resumen(p, seleccion),
              nota: nota.trim(),
              cantidad,
              precioUnitario: unitario,
            })
          }
        >
          Agregar · {formatearPrecio(unitario * cantidad)}
        </button>
      </div>
    </div>
  );
}
