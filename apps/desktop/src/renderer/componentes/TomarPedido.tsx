import { PapelComanda } from '@gula/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  CANTIDAD_MAXIMA,
  NOTA_MAXIMA,
  formatearPrecio,
  precioUnitario,
  resumirOpciones,
  validarSeleccion,
  type Seleccion,
} from '@gula/shared';
import type { ItemPedido } from '../../compartido/ipc';
import type { CartaLocal, ProductoLocal } from '../../compartido/tipos';
import { llamar, mensajeDe } from '../gula';
import { Dialogo } from './Dialogo';

type Props = {
  titulo: string;
  onEnviar: (items: ItemPedido[]) => Promise<void>;
  onCancelar: () => void;
};

type Linea = ItemPedido & { clave: number; producto: ProductoLocal };

/** Ignora mayúsculas y acentos ("cafe" encuentra "Café"). */
const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function ElegirOpciones({
  producto,
  onAgregar,
  onCerrar,
}: {
  producto: ProductoLocal;
  onAgregar: (l: Omit<Linea, 'clave'>) => void;
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState<Seleccion>({});
  const [nota, setNota] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const valido = validarSeleccion(producto, sel).ok;
  const elegir = (grupoId: string, opcionId: string, unica: boolean, marcado: boolean) => {
    setSel((s) => {
      const actual = s[grupoId] ?? [];
      const nuevo = unica ? [opcionId] : marcado ? [...actual, opcionId] : actual.filter((x) => x !== opcionId);
      return { ...s, [grupoId]: nuevo };
    });
  };
  const subtotal = precioUnitario(producto, sel) * cantidad;

  return (
    <Dialogo titulo={producto.nombre} onCerrar={onCerrar}>
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valido) return;
          // Se limpian los grupos vacíos para que la selección viaje igual que en la carta web.
          const seleccion = Object.fromEntries(Object.entries(sel).filter(([, v]) => v.length));
          onAgregar({ productoId: producto.id, seleccion, nota: nota.trim(), cantidad, producto });
        }}
      >
        {producto.grupos.map((g) => {
          const unica = g.max === 1;
          const elegidas = sel[g.id] ?? [];
          return (
            <fieldset key={g.id} className="bloque">
              <legend>
                {g.nombre}
                <span className="suave">
                  {' '}
                  {g.min > 0 ? (g.min === g.max ? `(elegí ${g.min})` : `(mínimo ${g.min})`) : `(hasta ${g.max})`}
                </span>
              </legend>
              {g.opciones.map((o) => (
                <label key={o.id} className="fila">
                  <input
                    type={unica ? 'radio' : 'checkbox'}
                    name={g.id}
                    disabled={!o.disponible || (!unica && !elegidas.includes(o.id) && elegidas.length >= g.max)}
                    checked={elegidas.includes(o.id)}
                    onChange={(e) => elegir(g.id, o.id, unica, e.target.checked)}
                  />
                  {o.nombre}
                  {o.recargo > 0 && <span className="suave">+{formatearPrecio(o.recargo)}</span>}
                  {!o.disponible && <span className="suave">(sin stock)</span>}
                </label>
              ))}
            </fieldset>
          );
        })}
        <label>
          Nota
          <input value={nota} maxLength={NOTA_MAXIMA} onChange={(e) => setNota(e.target.value)} />
        </label>
        <div className="fila">
          <button
            type="button"
            className="boton"
            aria-label="Restar uno"
            disabled={cantidad <= 1}
            onClick={() => setCantidad((c) => c - 1)}
          >
            −
          </button>
          <output aria-label="Cantidad">{cantidad}</output>
          <button
            type="button"
            className="boton"
            aria-label="Sumar uno"
            disabled={cantidad >= CANTIDAD_MAXIMA}
            onClick={() => setCantidad((c) => c + 1)}
          >
            +
          </button>
        </div>
        <div className="fila">
          <button type="submit" className="boton boton--principal" disabled={!valido}>
            Agregar · {formatearPrecio(subtotal)}
          </button>
          <button type="button" className="boton" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function TomarPedido({ titulo, onEnviar, onCancelar }: Props) {
  const [carta, setCarta] = useState<CartaLocal | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<ProductoLocal | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void llamar('carta:leer')
      .then(setCarta)
      .catch((e: unknown) => setError(mensajeDe(e)));
  }, []);

  const productos = useMemo(() => {
    if (!carta) return [];
    const q = normalizar(busqueda.trim());
    return carta.categorias
      .filter((c) => q || !categoria || c.id === categoria)
      .flatMap((c) => c.productos)
      .filter((p) => !q || normalizar(p.nombre).includes(q));
  }, [carta, busqueda, categoria]);

  const total = lineas.reduce((t, l) => t + precioUnitario(l.producto, l.seleccion) * l.cantidad, 0);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await onEnviar(lineas.map(({ productoId, seleccion, nota, cantidad }) => ({ productoId, seleccion, nota, cantidad })));
    } catch (e) {
      setError(mensajeDe(e));
      setEnviando(false);
    }
  };

  return (
    <div className="tomar">
      <div className="tomar__carta">
        <div className="fila fila--entre">
          <h2 className="titulo">Nuevo pedido</h2>
          <button type="button" className="boton" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
        <label className="campo">
          Buscar producto
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
        {carta && (
          <div className="fila" role="group" aria-label="Categorías">
            <button
              type="button"
              className={!categoria ? 'boton boton--principal' : 'boton'}
              aria-pressed={!categoria}
              onClick={() => setCategoria(null)}
            >
              Todo
            </button>
            {carta.categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                className={categoria === c.id ? 'boton boton--principal' : 'boton'}
                aria-pressed={categoria === c.id}
                onClick={() => setCategoria(c.id)}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="grilla-productos">
          {productos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="producto"
              disabled={!p.disponible}
              onClick={() => setEligiendo(p)}
            >
              <span>{p.nombre}</span>
              <span className="suave cifra">{p.disponible ? formatearPrecio(p.precio) : 'Sin stock'}</span>
            </button>
          ))}
          {carta && !productos.length && <p className="suave">No hay productos con ese nombre.</p>}
        </div>
      </div>

      <section className="tomar__resumen" aria-label="Pedido">
        <PapelComanda
          compacto
          titulo={titulo.toUpperCase()}
          subtitulo="PEDIDO NUEVO"
          lineas={lineas.map((l) => ({
            id: String(l.clave),
            cantidad: l.cantidad,
            nombre: l.producto.nombre,
            importe: precioUnitario(l.producto, l.seleccion) * l.cantidad,
            detalle: [resumirOpciones(l.producto, l.seleccion), l.nota].filter(Boolean).join(' · ') || undefined,
          }))}
          total={lineas.length ? total : undefined}
          accionesLinea={(linea) => (
            <button
              type="button"
              className="boton boton--chico boton--peligro"
              aria-label={`Quitar ${linea.nombre}`}
              onClick={() => setLineas((ls) => ls.filter((x) => String(x.clave) !== linea.id))}
            >
              Quitar
            </button>
          )}
        >
          {!lineas.length && <p className="suave">Tocá un producto para agregarlo.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="boton boton--principal"
            disabled={!lineas.length || enviando}
            onClick={() => void enviar()}
          >
            Enviar a cocina
          </button>
        </PapelComanda>
      </section>

      {eligiendo && (
        <ElegirOpciones
          producto={eligiendo}
          onCerrar={() => setEligiendo(null)}
          onAgregar={(l) => {
            setLineas((ls) => [...ls, { ...l, clave: Date.now() + ls.length }]);
            setEligiendo(null);
          }}
        />
      )}
    </div>
  );
}
