import { useEffect, useState } from 'react';
import { METODOS_PAGO, NOMBRE_METODO, formatearPrecio, montoDescuento, type MetodoPago } from '@gula/shared';
import { llamar, mensajeDe } from '../gula';
import { centavosAPesos, parsearPesos } from '../pesos';
import { Dialogo } from './Dialogo';

type Linea = { metodo: MetodoPago; monto: string; propina: string };
type Destino = { sesionId: string } | { pedidoId: string };

/** Cobro de una mesa o un pedido de mostrador: descuento, uno o varios pagos (dividir por monto), propina y vuelto. */
export function Cobrar({
  titulo,
  subtotal,
  destino,
  onListo,
  onCancelar,
}: {
  titulo: string;
  subtotal: number;
  destino: Destino;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [tipoDesc, setTipoDesc] = useState<'monto' | 'porcentaje'>('monto');
  const [valorDesc, setValorDesc] = useState('');
  const [motivo, setMotivo] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([{ metodo: 'efectivo', monto: centavosAPesos(subtotal), propina: '' }]);
  const [recibido, setRecibido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valor = tipoDesc === 'monto' ? parsearPesos(valorDesc) : valorDesc.trim() ? Number(valorDesc.replace(',', '.')) : 0;
  const descValido = valorDesc.trim() === '' || (valor !== null && Number.isFinite(valor) && valor >= 0);
  const descuento = descValido && valor ? montoDescuento(subtotal, { tipo: tipoDesc, valor }) : 0;
  const total = subtotal - descuento;

  // Con un solo pago, el monto sigue al total (al cambiar el descuento).
  useEffect(() => {
    setLineas((ls) => (ls.length === 1 ? [{ ...ls[0]!, monto: centavosAPesos(total) }] : ls));
  }, [total]);

  const montos = lineas.map((l) => parsearPesos(l.monto));
  const propinas = lineas.map((l) => (l.propina.trim() ? parsearPesos(l.propina) : 0));
  const pagado = montos.reduce<number>((s, m) => s + (m ?? 0), 0);
  const falta = total - pagado;
  const efectivo = lineas.reduce((s, l, i) => (l.metodo === 'efectivo' ? s + (montos[i] ?? 0) + (propinas[i] ?? 0) : s), 0);
  const rec = parsearPesos(recibido);
  const lineasValidas = montos.every((m) => m !== null && m > 0) && propinas.every((p) => p !== null);
  const puede = descValido && lineasValidas && falta === 0 && (!descuento || motivo.trim()) && !enviando;

  const cambiar = (i: number, c: Partial<Linea>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...c } : l)));

  return (
    <Dialogo titulo={`Cobrar ${titulo}`} onCerrar={onCancelar}>
      <p>Subtotal {formatearPrecio(subtotal)}</p>
      <div className="fila">
        <label className="campo">
          Tipo de descuento
          <select value={tipoDesc} onChange={(e) => setTipoDesc(e.target.value as 'monto' | 'porcentaje')}>
            <option value="monto">$</option>
            <option value="porcentaje">%</option>
          </select>
        </label>
        <label className="campo">
          Descuento
          <input inputMode="decimal" value={valorDesc} onChange={(e) => setValorDesc(e.target.value)} placeholder="0" />
        </label>
        {descuento > 0 && (
          <label className="campo">
            Motivo del descuento
            <input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} />
          </label>
        )}
      </div>
      <p className="caja__esperado">
        <strong>Total a cobrar {formatearPrecio(total)}</strong>
        {descuento > 0 && <span className="suave"> (descuento {formatearPrecio(descuento)})</span>}
      </p>

      {lineas.map((l, i) => (
        <div key={i} className="fila">
          <label className="campo">
            {`Método pago ${i + 1}`}
            <select value={l.metodo} onChange={(e) => cambiar(i, { metodo: e.target.value as MetodoPago })}>
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_METODO[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            {`Monto pago ${i + 1}`}
            <input inputMode="decimal" value={l.monto} onChange={(e) => cambiar(i, { monto: e.target.value })} />
          </label>
          <label className="campo">
            {`Propina pago ${i + 1}`}
            <input inputMode="decimal" value={l.propina} placeholder="0" onChange={(e) => cambiar(i, { propina: e.target.value })} />
          </label>
          {lineas.length > 1 && (
            <button type="button" className="boton" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
              Quitar
            </button>
          )}
        </div>
      ))}
      <div className="fila">
        <button
          type="button"
          className="boton"
          disabled={lineas.length >= 10}
          onClick={() =>
            setLineas([...lineas, { metodo: 'efectivo', monto: falta > 0 ? centavosAPesos(falta) : '', propina: '' }])
          }
        >
          Dividir
        </button>
        {falta > 0 && <strong className="error-texto">Falta {formatearPrecio(falta)}</strong>}
        {falta < 0 && <strong className="error-texto">Sobra {formatearPrecio(-falta)}</strong>}
      </div>

      {efectivo > 0 && (
        <div className="fila">
          <label className="campo">
            Recibido en efectivo
            <input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value)} />
          </label>
          {rec !== null && rec >= efectivo && <strong>Vuelto {formatearPrecio(rec - efectivo)}</strong>}
          {rec !== null && rec < efectivo && <strong className="error-texto">Faltan {formatearPrecio(efectivo - rec)}</strong>}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fila">
        <button
          type="button"
          className="boton boton--principal"
          disabled={!puede}
          onClick={() => {
            setEnviando(true);
            setError(null);
            void llamar('caja:cobrar', {
              destino,
              descuento: descuento ? { tipo: tipoDesc, valor: valor!, motivo: motivo.trim() } : null,
              pagos: lineas.map((l, i) => ({ metodo: l.metodo, monto: montos[i]!, propina: propinas[i]! })),
            })
              .then(onListo)
              .catch((e: unknown) => setError(mensajeDe(e)))
              .finally(() => setEnviando(false));
          }}
        >
          Cobrar
        </button>
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  );
}
