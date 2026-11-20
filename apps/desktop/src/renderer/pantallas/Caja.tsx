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

/** Importe con signo explícito: el egreso se lee como egreso aunque no se vea el color. */
const conSigno = (tipo: TipoMovimiento, monto: number) => `${tipo === 'egreso' ? '−' : '+'} ${formatearPrecio(monto)}`;

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
      <div className="caja-cerrada">
        <section className="modulo caja-cerrada__abrir" aria-labelledby="abrir-caja">
          <h2 id="abrir-caja" className="modulo__titulo">
            La caja está cerrada
          </h2>
          <p className="suave">Abrila con el fondo de cambio para empezar a cobrar.</p>
          <form
            className="caja-cerrada__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (f === null || enviando) return;
              void intentar(() => llamar('caja:abrir', { fondo: f }), 'Caja abierta.').then((x) => x && setFondo(''));
            }}
          >
            <label className="campo">
              Fondo de cambio
              <input className="cifra caja__monto" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} placeholder="$ 0" />
            </label>
            <button type="submit" className="boton boton--linea" disabled={f === null || enviando}>
              Abrir caja
            </button>
          </form>
          {avisos}
        </section>
        {caja.ultimoCierre && (
          <p className="caja-cerrada__ultimo">
            Último cierre a las {hora(caja.ultimoCierre.cerradoEn!)} · contado{' '}
            <span className="cifra">{formatearPrecio(caja.ultimoCierre.contado ?? 0)}</span> ·{' '}
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
    <div className="caja">
      <div className="caja__arqueo">
        <section className="modulo" aria-labelledby="arqueo">
          <h2 id="arqueo" className="modulo__titulo">
            Arqueo
          </h2>
          <table className="tabla tabla--plana" aria-label="Ventas por método">
            <thead>
              <tr>
                <th scope="col">Método</th>
                <th scope="col">Ventas</th>
                <th scope="col">Propinas</th>
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
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td>{formatearPrecio(r.ventas)}</td>
                <td>{formatearPrecio(r.propinas)}</td>
              </tr>
            </tfoot>
          </table>
          <dl className="caja__cuentas">
            <div>
              <dt>Fondo inicial</dt>
              <dd>{formatearPrecio(caja.turno.fondo)}</dd>
            </div>
            <div>
              <dt>Ingresos</dt>
              <dd>{conSigno('ingreso', r.ingresos)}</dd>
            </div>
            <div>
              <dt>Egresos</dt>
              <dd>{conSigno('egreso', r.egresos)}</dd>
            </div>
          </dl>
          <p className="caja__esperado">
            <span>Efectivo esperado</span> <strong>{formatearPrecio(r.efectivoEsperado)}</strong>
          </p>
          {avisos}
          {!cerrando ? (
            <button type="button" className="boton" onClick={() => setCerrando(true)}>
              Cerrar caja
            </button>
          ) : (
            <div className="caja__cierre" role="group" aria-label="Cierre de caja">
              <label className="campo">
                Efectivo contado
                <input className="cifra caja__monto" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus />
              </label>
              <p className="caja__diferencia" aria-live="polite">
                {c !== null ? (
                  <>
                    Esperado <span className="cifra">{formatearPrecio(r.efectivoEsperado)}</span> · <Diferencia valor={c - r.efectivoEsperado} />
                  </>
                ) : (
                  'Contá el efectivo del cajón y cargalo.'
                )}
              </p>
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
        </section>
      </div>

      <div className="caja__libro">
        <fieldset className="modulo caja__movimiento" aria-label="Nuevo movimiento">
          <legend className="modulo__titulo">Ingreso o egreso de efectivo</legend>
          <div className="caja__movimiento-campos">
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
              <input className="cifra" inputMode="decimal" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} />
            </label>
            <label className="campo caja__motivo">
              Motivo
              <input value={mov.motivo} maxLength={140} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} />
            </label>
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
          </div>
        </fieldset>

        <section className="modulo" aria-labelledby="movimientos">
          <h2 id="movimientos" className="modulo__titulo">
            Movimientos <span className="columna__cuenta">{caja.movimientos.length}</span>
          </h2>
          {!caja.movimientos.length ? (
            <p className="suave">Sin movimientos.</p>
          ) : (
            <table className="tabla tabla--plana" aria-label="Movimientos">
              <thead>
                <tr>
                  <th scope="col" className="tabla__texto">Hora</th>
                  <th scope="col" className="tabla__texto">Tipo</th>
                  <th scope="col" className="tabla__texto">Motivo</th>
                  <th scope="col">Monto</th>
                </tr>
              </thead>
              <tbody>
                {caja.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="cifra">{hora(m.hechoEn)}</td>
                    <td className="tabla__texto">
                      <span className={m.tipo === 'egreso' ? 'mov mov--egreso' : 'mov mov--ingreso'}>{m.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}</span>
                      <span className="suave"> · {NOMBRE_CATEGORIA[m.categoria]}</span>
                    </td>
                    <td className="tabla__texto">{m.motivo}</td>
                    <td>{conSigno(m.tipo, m.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="modulo" aria-labelledby="cobros">
          <h2 id="cobros" className="modulo__titulo">
            Cobros <span className="columna__cuenta">{caja.cobros.length}</span>
          </h2>
          {!caja.cobros.length ? (
            <p className="suave">Todavía no se cobró nada.</p>
          ) : (
            <table className="tabla tabla--plana" aria-label="Cobros">
              <thead>
                <tr>
                  <th scope="col" className="tabla__texto">Hora</th>
                  <th scope="col" className="tabla__texto">Qué</th>
                  <th scope="col" className="tabla__texto">Cómo</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {caja.cobros.map((x) => (
                  <tr key={x.id}>
                    <td className="cifra">{hora(x.cobradoEn)}</td>
                    <td className="tabla__texto">{x.destino}</td>
                    <td className="tabla__texto suave">{x.pagos.map((p) => NOMBRE_METODO[p.metodo]).join(' + ')}</td>
                    <td>{formatearPrecio(x.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
