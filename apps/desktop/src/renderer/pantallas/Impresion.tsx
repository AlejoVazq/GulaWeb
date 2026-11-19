import { useEffect, useState } from 'react';
import type { ConfigImpresion, EstadoImpresion } from '../../compartido/impresion';
import { llamar, mensajeDe } from '../gula';
import { useImpresion } from '../useImpresion';
import { hora } from '../formato';

const ESTADOS: Record<EstadoImpresion, string> = {
  pendiente: 'En cola',
  imprimiendo: 'Imprimiendo',
  impresa: 'Impresa',
  error: 'No se imprimió',
  descartada: 'Descartada',
};

export function Impresion() {
  const [config, setConfig] = useState<ConfigImpresion | null>(null);
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { recientes } = useImpresion();

  useEffect(() => {
    void llamar('impresion:config').then(({ impresoras: lista, ...c }) => {
      setConfig(c);
      setImpresoras(lista);
    });
  }, []);

  const intentar = async (fn: () => Promise<unknown>, mensaje: string) => {
    setOk(null);
    setError(null);
    try {
      await fn();
      setOk(mensaje);
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  if (!config) return <p className="suave">Cargando…</p>;
  const cambiar = (c: Partial<ConfigImpresion>) => setConfig({ ...config, ...c });

  return (
    <div className="detalle">
      <h1 className="titulo">Impresión</h1>
      <fieldset className="bloque">
        <legend>Dónde imprimir</legend>
        <label className="fila">
          <input type="radio" name="modo" checked={config.modo === 'impresora'} onChange={() => cambiar({ modo: 'impresora' })} />
          Impresora
        </label>
        <label className="fila">
          <input type="radio" name="modo" checked={config.modo === 'vista_previa'} onChange={() => cambiar({ modo: 'vista_previa' })} />
          Vista previa en pantalla (sin impresora)
        </label>
      </fieldset>
      {config.modo === 'impresora' && (
        <label className="campo">
          Impresora de Windows
          <select value={config.impresora ?? ''} onChange={(e) => cambiar({ impresora: e.target.value || null })}>
            <option value="">Elegí una…</option>
            {impresoras.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="campo">
        Ancho del papel
        <select value={config.columnas} onChange={(e) => cambiar({ columnas: Number(e.target.value) as 48 | 32 })}>
          <option value={48}>80 mm</option>
          <option value={32}>58 mm</option>
        </select>
      </label>
      <div className="fila">
        <button
          type="button"
          className="boton boton--principal"
          onClick={() => void intentar(() => llamar('impresion:guardarConfig', config), 'Guardado.')}
        >
          Guardar
        </button>
        <button type="button" className="boton" onClick={() => void intentar(() => llamar('impresion:prueba'), 'Prueba enviada.')}>
          Imprimir prueba
        </button>
      </div>
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
      <h2>Últimos tickets</h2>
      {!recientes.length && <p className="suave">Todavía no se imprimió nada.</p>}
      <ul className="lista">
        {recientes.map((t) => (
          <li key={t.id} className="lista__item">
            <span>{t.titulo}</span>
            <span className="suave">{hora(t.creadaEn)}</span>
            <span className={t.estado === 'error' ? 'etiqueta etiqueta--pendiente' : 'etiqueta'}>{ESTADOS[t.estado]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
