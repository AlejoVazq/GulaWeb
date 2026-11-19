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
  type Rango,
  type TipoPeriodo,
} from '@gula/shared';
import { fechaCorta, filasResumen, textoVariacion, type RespuestaReporte } from '../../compartido/reportes';
import { llamar, mensajeDe } from '../gula';

const TARJETAS = new Set(['Ventas', 'Cobros', 'Ticket promedio', 'Propinas', 'Egresos', 'Resultado']);

function Tabla({ titulo, cabeza, filas }: { titulo: string; cabeza: string[]; filas: (string | number)[][] }) {
  if (!filas.length) return null;
  return (
    <section className="bloque">
      <h2 className="mesas__zona">{titulo}</h2>
      <table className="tabla" aria-label={titulo}>
        <thead>
          <tr>
            {cabeza.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, j) => (
            <tr key={j}>
              {f.map((c, i) =>
                i ? (
                  <td key={i}>{c}</td>
                ) : (
                  <th key={i} scope="row">
                    {c}
                  </th>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
      <div className="fila">
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
        {tipo === 'personalizado' ? (
          <>
            <label className="campo">
              Desde
              <input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
            </label>
            <label className="campo">
              Hasta
              <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
            </label>
          </>
        ) : (
          <strong>
            {fechaCorta(rango.desde)} al {fechaCorta(rango.hasta)}
          </strong>
        )}
        <button type="button" className="boton" onClick={() => setRango(periodoAnterior(tipo, rango))}>
          ◀ Anterior
        </button>
        <button type="button" className="boton" onClick={() => setRango(periodoSiguiente(tipo, rango))}>
          Siguiente ▶
        </button>
        <button type="button" className="boton" disabled={!datos} onClick={() => exportar('csv')}>
          Exportar CSV
        </button>
        <button type="button" className="boton" disabled={!datos} onClick={() => exportar('pdf')}>
          Exportar PDF
        </button>
      </div>
      {cargando && <p className="suave">Calculando…</p>}
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
      {a && b && datos && (
        <>
          <p className="suave">
            Comparado con {fechaCorta(datos.rangoAnterior.desde)} al {fechaCorta(datos.rangoAnterior.hasta)}
          </p>
          <div className="reportes__tarjetas">
            {filasResumen(a)
              .filter((f) => TARJETAS.has(f.nombre))
              .map((f) => {
                const x = a[f.clave] as number;
                const y = (b[f.clave] as number | undefined) ?? 0;
                const mostrar = (v: number) => (f.dinero ? formatearPrecio(v) : String(v));
                return (
                  <div key={f.nombre} role="group" aria-label={f.nombre} className="tarjeta reportes__tarjeta">
                    <span className="suave">{f.nombre}</span>
                    <strong className="reportes__valor">{mostrar(x)}</strong>
                    <span>
                      {textoVariacion(x, y)} <span className="suave">(antes {mostrar(y)})</span>
                    </span>
                  </div>
                );
              })}
          </div>
          {a.cobros === 0 && <p className="suave">No hubo ventas en este período.</p>}
          <div className="reportes__tablas">
            <Tabla titulo="Por método de pago" cabeza={['Método', 'Ventas', 'Propinas']} filas={a.porMetodo.map((m) => [NOMBRE_METODO[m.metodo], formatearPrecio(m.monto), formatearPrecio(m.propinas)])} />
            <Tabla titulo="Por origen" cabeza={['Origen', 'Ventas', 'Cobros']} filas={a.porOrigen.map((o) => [NOMBRE_ORIGEN[o.origen], formatearPrecio(o.ventas), o.cobros])} />
            <Tabla titulo="Productos más vendidos" cabeza={['Producto', 'Cantidad', 'Importe']} filas={a.productos.map((p) => [p.nombre, p.cantidad, formatearPrecio(p.importe)])} />
            <Tabla titulo="Ventas por mesero" cabeza={['Mesero', 'Pedidos', 'Importe']} filas={a.meseros.map((m) => [m.nombre, m.pedidos, formatearPrecio(m.importe)])} />
            <Tabla titulo="Por hora" cabeza={['Hora', 'Ventas', 'Cobros']} filas={a.porHora.map((h) => [`${String(h.hora).padStart(2, '0')}:00`, formatearPrecio(h.ventas), h.cobros])} />
          </div>
          {(a.descuentos > 0 || a.envios > 0) && (
            <p className="suave">
              Descuentos {formatearPrecio(a.descuentos)} · Envíos cobrados {formatearPrecio(a.envios)} (incluidos en las ventas)
            </p>
          )}
        </>
      )}
    </div>
  );
}
