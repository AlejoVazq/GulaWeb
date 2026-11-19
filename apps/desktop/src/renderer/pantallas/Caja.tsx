import { useRef, useState } from 'react';
import {
  CATEGORIAS_MOVIMIENTO,
  METODOS_PAGO,
  NOMBRE_CATEGORIA,
  NOMBRE_METODO,
  formatearPrecio,
  type CategoriaMovimiento,
  type TipoMovimiento,
} from '@gula/shared';
import { llamar, mensajeDe } from '../gula';
import { parsearPesos } from '../pesos';
import { hora } from '../formato';
import { useCaja } from '../useCaja';

function Diferencia({ valor }: { valor: number }) {
  if (valor === 0) return <strong className="ok-texto">Da justo</strong>;
  return valor < 0 ? (
    <strong className="error-texto">Faltan {formatearPrecio(-valor)}</strong>
  ) : (
    <strong className="ok-texto">Sobran {formatearPrecio(valor)}</strong>
  );
}

export function Caja() {
  const { caja } = useCaja();
  const [fondo, setFondo] = useState('');
  const [mov, setMov] = useState<{ tipo: TipoMovimiento; categoria: CategoriaMovimiento; monto: string; motivo: string }>({
    tipo: 'egreso',
    categoria: 'proveedores',
    monto: '',
    motivo: '',
  });
  const [cerrando, setCerrando] = useState(false);
  const [contado, setContado] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Un solo envío a la vez: un doble clic no registra dos movimientos (ni dos aperturas o cierres).
  const enCurso = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const intentar = async (fn: () => Promise<unknown>, mensaje: string) => {
    if (enCurso.current) return false;
    enCurso.current = true;
    setEnviando(true);
    setOk(null);
    setError(null);
    try {
      await fn();
      setOk(mensaje);
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  };

  if (!caja) return <p className="suave">Cargando…</p>;
  const avisos = (
    <>
      {ok && (
        <p className="ok" role="status">
          {ok}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (!caja.turno || !caja.resumen) {
    const f = parsearPesos(fondo);
    return (
      <div className="detalle">
        <h1 className="titulo">Caja</h1>
        <p className="suave">La caja está cerrada. Abrila con el fondo de cambio para empezar a cobrar.</p>
        <label className="campo">
          Fondo de cambio
          <input inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="$ 0" />
        </label>
        <button
          type="button"
          className="boton boton--principal"
          disabled={f === null || enviando}
          onClick={() => void intentar(() => llamar('caja:abrir', { fondo: f! }), 'Caja abierta.').then((x) => x && setFondo(''))}
        >
          Abrir caja
        </button>
        {avisos}
        {caja.ultimoCierre && (
          <p className="suave">
            Último cierre: {hora(caja.ultimoCierre.cerradoEn!)} · contado {formatearPrecio(caja.ultimoCierre.contado ?? 0)} ·{' '}
            <Diferencia valor={caja.ultimoCierre.diferencia ?? 0} />
          </p>
        )}
      </div>
    );
  }

  const r = caja.resumen;
  const montoMov = parsearPesos(mov.monto);
  const c = parsearPesos(contado);
  return (
    <div className="detalle">
      <div className="fila fila--entre">
        <h1 className="titulo">Caja</h1>
        <span className="suave">
          Abierta {hora(caja.turno.abiertoEn)} · fondo {formatearPrecio(caja.turno.fondo)}
        </span>
      </div>
      {avisos}

      <table className="tabla" aria-label="Ventas por método">
        <thead>
          <tr>
            <th>Método</th>
            <th>Ventas</th>
            <th>Propinas</th>
          </tr>
        </thead>
        <tbody>
          {METODOS_PAGO.filter((m) => m === 'efectivo' || r.porMetodo[m].ventas || r.porMetodo[m].propinas).map((m) => (
            <tr key={m}>
              <th scope="row">{NOMBRE_METODO[m]}</th>
              <td>{formatearPrecio(r.porMetodo[m].ventas)}</td>
              <td>{formatearPrecio(r.porMetodo[m].propinas)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total</th>
            <td>{formatearPrecio(r.ventas)}</td>
            <td>{formatearPrecio(r.propinas)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Ingresos {formatearPrecio(r.ingresos)} · Egresos {formatearPrecio(r.egresos)}
      </p>
      <p className="caja__esperado">
        <strong>Efectivo esperado {formatearPrecio(r.efectivoEsperado)}</strong>
      </p>

      {!cerrando ? (
        <button type="button" className="boton" onClick={() => setCerrando(true)}>
          Cerrar caja
        </button>
      ) : (
        <div className="bloque" role="group" aria-label="Cierre de caja">
          <label className="campo">
            Efectivo contado
            <input inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} />
          </label>
          {c !== null && (
            <p>
              Esperado {formatearPrecio(r.efectivoEsperado)} · <Diferencia valor={c - r.efectivoEsperado} />
            </p>
          )}
          <div className="fila">
            <button
              type="button"
              className="boton boton--principal"
              disabled={c === null || enviando}
              onClick={() =>
                void intentar(() => llamar('caja:cerrar', { contado: c! }), 'Caja cerrada. Se imprimió el cierre.').then((x) => {
                  if (x) {
                    setCerrando(false);
                    setContado('');
                  }
                })
              }
            >
              Confirmar cierre
            </button>
            <button type="button" className="boton" onClick={() => setCerrando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <fieldset className="bloque" aria-label="Nuevo movimiento">
        <legend>Ingreso o egreso de efectivo</legend>
        <div className="fila">
          <label className="campo">
            Tipo
            <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value as TipoMovimiento })}>
              <option value="egreso">Egreso</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </label>
          <label className="campo">
            Categoría
            <select value={mov.categoria} onChange={(e) => setMov({ ...mov, categoria: e.target.value as CategoriaMovimiento })}>
              {CATEGORIAS_MOVIMIENTO.map((x) => (
                <option key={x} value={x}>
                  {NOMBRE_CATEGORIA[x]}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            Monto
            <input inputMode="decimal" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} />
          </label>
          <label className="campo">
            Motivo
            <input value={mov.motivo} maxLength={140} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
          </label>
        </div>
        <button
          type="button"
          className="boton boton--principal"
          disabled={!montoMov || !mov.motivo.trim() || enviando}
          onClick={() =>
            void intentar(
              () => llamar('caja:movimiento', { tipo: mov.tipo, categoria: mov.categoria, monto: montoMov!, motivo: mov.motivo.trim() }),
              'Movimiento registrado.',
            ).then((x) => x && setMov({ ...mov, monto: '', motivo: '' }))
          }
        >
          Registrar
        </button>
      </fieldset>

      <h2>Movimientos</h2>
      {!caja.movimientos.length && <p className="suave">Sin movimientos.</p>}
      <ul className="lista">
        {caja.movimientos.map((m) => (
          <li key={m.id} className="lista__item">
            <span>
              {hora(m.hechoEn)} · {m.tipo === 'egreso' ? 'Egreso' : 'Ingreso'} · {NOMBRE_CATEGORIA[m.categoria]}
            </span>
            <span>{m.motivo}</span>
            <span>{formatearPrecio(m.tipo === 'egreso' ? -m.monto : m.monto)}</span>
          </li>
        ))}
      </ul>

      <h2>Cobros</h2>
      {!caja.cobros.length && <p className="suave">Todavía no se cobró nada.</p>}
      <ul className="lista">
        {caja.cobros.map((x) => (
          <li key={x.id} className="lista__item">
            <span>
              {hora(x.cobradoEn)} · {x.destino}
            </span>
            <span className="suave">{x.pagos.map((p) => NOMBRE_METODO[p.metodo]).join(' + ')}</span>
            <span>{formatearPrecio(x.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
