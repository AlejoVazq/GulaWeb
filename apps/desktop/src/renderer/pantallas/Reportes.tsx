import { useEffect, useState } from 'react';
import {
  NOMBRE_METODO,
  NOMBRE_ORIGEN,
  NOMBRE_PERIODO,
  TIPOS_PERIODO,
  diaOperativo,
  formatearPrecio,
  periodoAnterior,
  periodoQueContiene,
  periodoSiguiente,
  rangoValido,
  variacion,
  type Rango,
  type Reporte,
  type TipoPeriodo,
} from '@gula/shared';
import {
  fechaCorta,
  filasResumen,
  textoVariacion,
  type RespuestaReporte,
} from '../../compartido/reportes';
import { llamar, mensajeDe } from '../gula';

/** Lo que va en fichas; Ventas va aparte como cifra principal. */
const FICHAS = new Set(['Cobros', 'Ticket promedio', 'Propinas', 'Egresos', 'Resultado']);
/** En estas, que suba es malo. */
const SUBIR_ES_MALO = new Set(['Egresos']);

const horaTexto = (h: number) => `${String(h).padStart(2, '0')}:00`;

function Variacion({ nombre, x, y }: { nombre: string; x: number; y: number }) {
  const v = variacion(x, y);
  const tono =
    v === null || v === 0 ? 'neutra' : v > 0 !== SUBIR_ES_MALO.has(nombre) ? 'buena' : 'mala';
  return <span className={`variacion variacion--${tono}`}>{textoVariacion(x, y)}</span>;
}

function Flecha({ hacia }: { hacia: 'izq' | 'der' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={hacia === 'izq' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tabla con barra: cada fila lleva su barra proporcional al primer valor numérico.
 * La tabla es a la vez el gráfico y su vista accesible (todos los valores quedan escritos).
 */
function TablaConBarras({
  titulo,
  cabeza,
  filas,
  medida,
}: {
  titulo: string;
  cabeza: string[];
  filas: (string | number)[][];
  medida: number[];
}) {
  if (!filas.length) return null;
  const max = Math.max(...medida, 1);
  return (
    <section className="modulo grafico" aria-labelledby={`t-${titulo}`}>
      <h2 id={`t-${titulo}`} className="modulo__titulo">
        {titulo}
      </h2>
      <table className="tabla tabla--plana tabla--barras" aria-label={titulo}>
        <thead>
          <tr>
            {cabeza.map((c, i) => (
              <th key={c} scope="col" className={i ? undefined : 'tabla__texto'}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, j) => (
            <tr key={j}>
              <th scope="row" className="tabla__texto">
                <span className="barra__nombre">{f[0]}</span>
                <span className="barra" aria-hidden="true">
                  <span
                    className="barra__relleno"
                    style={{ width: `${Math.max((medida[j]! / max) * 100, medida[j] ? 1.5 : 0)}%` }}
                  />
                </span>
              </th>
              {f.slice(1).map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Ventas por hora en columnas; el detalle de cada hora aparece al pasar el mouse o con el foco. */
function VentasPorHora({ datos }: { datos: Reporte['porHora'] }) {
  const [activa, setActiva] = useState<number | null>(null);
  if (!datos.length) return null;
  const max = Math.max(...datos.map((d) => d.ventas), 1);
  const pico = datos.findIndex((d) => d.ventas === max);
  return (
    <section className="modulo grafico grafico--ancho" aria-labelledby="t-hora">
      <h2 id="t-hora" className="modulo__titulo">
        Ventas por hora
      </h2>
      <div className="columnas" onPointerLeave={() => setActiva(null)}>
        <ul className="columnas__area" aria-label="Ventas por hora">
          {datos.map((d, i) => (
            <li
              key={d.hora}
              className={i === activa ? 'columnas__hora columnas__hora--activa' : 'columnas__hora'}
              tabIndex={0}
              aria-label={`${horaTexto(d.hora)}: ${formatearPrecio(d.ventas)} en ${d.cobros} ${d.cobros === 1 ? 'cobro' : 'cobros'}`}
              onPointerEnter={() => setActiva(i)}
              onFocus={() => setActiva(i)}
              onBlur={() => setActiva(null)}
            >
              <span className="columnas__barra" style={{ height: `${(d.ventas / max) * 100}%` }}>
                {i === pico && activa === null && (
                  <span className="columnas__pico">{formatearPrecio(d.ventas)}</span>
                )}
                {i === activa && (
                  <span className="columnas__globo" role="presentation">
                    <strong>{formatearPrecio(d.ventas)}</strong>
                    <span>
                      {horaTexto(d.hora)} · {d.cobros} {d.cobros === 1 ? 'cobro' : 'cobros'}
                    </span>
                  </span>
                )}
              </span>
              <span className="columnas__etiqueta" aria-hidden="true">
                {String(d.hora).padStart(2, '0')}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <details className="grafico__tabla">
        <summary>Ver como tabla</summary>
        <table className="tabla tabla--plana" aria-label="Por hora">
          <thead>
            <tr>
              <th scope="col" className="tabla__texto">
                Hora
              </th>
              <th scope="col">Ventas</th>
              <th scope="col">Cobros</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((h) => (
              <tr key={h.hora}>
                <th scope="row" className="tabla__texto">
                  {horaTexto(h.hora)}
                </th>
                <td>{formatearPrecio(h.ventas)}</td>
                <td>{h.cobros}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/** Reportes del local (se calculan en el servidor: necesitan conexión). */
export function Reportes({ hoy = diaOperativo(new Date()) }: { hoy?: string }) {
  const [tipo, setTipo] = useState<TipoPeriodo>('mes');
  const [rango, setRango] = useState<Rango>(() => periodoQueContiene('mes', hoy));
  const [datos, setDatos] = useState<RespuestaReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const invalido = rangoValido(rango);
    if (invalido) {
      setError(invalido);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    void llamar('reportes:obtener', { tipo, ...rango })
      .then((r) => vigente && setDatos(r))
      .catch((e: unknown) => {
        if (vigente) {
          setDatos(null);
          setError(mensajeDe(e));
        }
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [tipo, rango]);

  const exportar = (formato: 'csv' | 'pdf') => {
    if (!datos) return;
    setAviso(null);
    void llamar('reportes:exportar', { formato, reporte: datos })
      .then((ok) => ok && setAviso('Reporte guardado.'))
      .catch((e: unknown) => setError(mensajeDe(e)));
  };

  const a = datos?.actual;
  const b = datos?.anterior;
  return (
    <div className="reportes">
      <div className="herramientas">
        <div className="reportes__periodo">
          <label className="campo">
            Período
            <select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as TipoPeriodo;
                setTipo(t);
                if (t !== 'personalizado') setRango(periodoQueContiene(t, hoy));
              }}
            >
              {TIPOS_PERIODO.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_PERIODO[t]}
                </option>
              ))}
            </select>
          </label>
          {tipo === 'personalizado' && (
            <>
              <label className="campo">
                Desde
                <input
                  type="date"
                  value={rango.desde}
                  onChange={(e) => setRango({ ...rango, desde: e.target.value })}
                />
              </label>
              <label className="campo">
                Hasta
                <input
                  type="date"
                  value={rango.hasta}
                  onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="paginador">
            <button
              type="button"
              className="boton boton--icono"
              onClick={() => setRango(periodoAnterior(tipo, rango))}
            >
              <Flecha hacia="izq" />
              Anterior
            </button>
            {tipo !== 'personalizado' && (
              <strong className="paginador__rango cifra">
                {fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}
              </strong>
            )}
            <button
              type="button"
              className="boton boton--icono"
              onClick={() => setRango(periodoSiguiente(tipo, rango))}
            >
              Siguiente
              <Flecha hacia="der" />
            </button>
          </div>
        </div>
        <div className="fila">
          <button type="button" className="boton" disabled={!datos} onClick={() => exportar('csv')}>
            Exportar CSV
          </button>
          <button type="button" className="boton" disabled={!datos} onClick={() => exportar('pdf')}>
            Exportar PDF
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {aviso && (
        <p className="ok" role="status">
          {aviso}
        </p>
      )}
      {cargando && !datos && <p className="suave">Calculando…</p>}
      {a && b && datos && (
        // Mientras recalcula, se queda lo anterior atenuado: sin saltos ni parpadeo.
        <div
          className={cargando ? 'reportes__cuerpo reportes__cuerpo--cargando' : 'reportes__cuerpo'}
          aria-busy={cargando}
        >
          <section className="reportes__resumen" aria-label="Resumen">
            <div role="group" aria-label="Ventas" className="modulo cifra-principal">
              <span className="cifra-principal__nombre">Ventas</span>
              <strong className="cifra-principal__valor">{formatearPrecio(a.ventas)}</strong>
              <span className="cifra-principal__comparacion">
                <Variacion nombre="Ventas" x={a.ventas} y={b.ventas} /> contra{' '}
                {formatearPrecio(b.ventas)} del {fechaCorta(datos.rangoAnterior.desde)} al{' '}
                {fechaCorta(datos.rangoAnterior.hasta)}
              </span>
            </div>
            <div className="reportes__fichas">
              {filasResumen(a)
                .filter((f) => FICHAS.has(f.nombre))
                .map((f) => {
                  const x = a[f.clave] as number;
                  const y = (b[f.clave] as number | undefined) ?? 0;
                  const mostrar = (v: number) => (f.dinero ? formatearPrecio(v) : String(v));
                  return (
                    <div key={f.nombre} role="group" aria-label={f.nombre} className="modulo ficha">
                      <span className="ficha__nombre">{f.nombre}</span>
                      <strong className="ficha__valor">{mostrar(x)}</strong>
                      <span className="ficha__comparacion">
                        <Variacion nombre={f.nombre} x={x} y={y} />{' '}
                        <span className="suave">antes {mostrar(y)}</span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>
          {a.cobros === 0 && <p className="columna__vacia">No hubo ventas en este período.</p>}
          {(a.descuentos > 0 || a.envios > 0) && (
            <p className="suave">
              Descuentos {formatearPrecio(a.descuentos)} · envíos cobrados{' '}
              {formatearPrecio(a.envios)} (incluidos en las ventas)
            </p>
          )}
          <div className="reportes__graficos">
            <VentasPorHora datos={a.porHora} />
            <TablaConBarras
              titulo="Por método de pago"
              cabeza={['Método', 'Ventas', 'Propinas']}
              filas={a.porMetodo.map((m) => [
                NOMBRE_METODO[m.metodo],
                formatearPrecio(m.monto),
                formatearPrecio(m.propinas),
              ])}
              medida={a.porMetodo.map((m) => m.monto)}
            />
            <TablaConBarras
              titulo="Por origen"
              cabeza={['Origen', 'Ventas', 'Cobros']}
              filas={a.porOrigen.map((o) => [
                NOMBRE_ORIGEN[o.origen],
                formatearPrecio(o.ventas),
                o.cobros,
              ])}
              medida={a.porOrigen.map((o) => o.ventas)}
            />
            <TablaConBarras
              titulo="Productos más vendidos"
              cabeza={['Producto', 'Cantidad', 'Importe']}
              filas={a.productos.map((p) => [p.nombre, p.cantidad, formatearPrecio(p.importe)])}
              medida={a.productos.map((p) => p.importe)}
            />
            <TablaConBarras
              titulo="Ventas por mesero"
              cabeza={['Mesero', 'Pedidos', 'Importe']}
              filas={a.meseros.map((m) => [m.nombre, m.pedidos, formatearPrecio(m.importe)])}
              medida={a.meseros.map((m) => m.importe)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
