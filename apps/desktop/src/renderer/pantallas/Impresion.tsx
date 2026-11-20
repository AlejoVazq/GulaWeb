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

  const opcion = (modo: ConfigImpresion['modo'], titulo: string, detalle: string) => (
    <label className={config.modo === modo ? 'opcion opcion--elegida' : 'opcion'}>
      <input
        type="radio"
        name="modo"
        checked={config.modo === modo}
        onChange={() => cambiar({ modo })}
        aria-label={titulo}
      />
      <span className="opcion__texto">
        <strong>{titulo}</strong>
        <span className="suave">{detalle}</span>
      </span>
    </label>
  );

  return (
    <div className="impresion">
      <div className="impresion__config">
        <fieldset className="modulo">
          <legend className="modulo__titulo">Dónde imprimir</legend>
          <div className="opciones">
            {opcion('impresora', 'Impresora', 'Comandas, cuentas y cierres salen por la térmica.')}
            {opcion(
              'vista_previa',
              'Vista previa en pantalla (sin impresora)',
              'Cada ticket aparece en un costado de la pantalla.',
            )}
          </div>
          <div className="impresion__campos">
            {config.modo === 'impresora' && (
              <label className="campo">
                Impresora de Windows
                <select
                  value={config.impresora ?? ''}
                  onChange={(e) => cambiar({ impresora: e.target.value || null })}
                >
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
              <select
                value={config.columnas}
                onChange={(e) => cambiar({ columnas: Number(e.target.value) as 48 | 32 })}
              >
                <option value={48}>80 mm</option>
                <option value={32}>58 mm</option>
              </select>
            </label>
          </div>
          <div className="fila">
            <button
              type="button"
              className="boton boton--principal"
              onClick={() =>
                void intentar(() => llamar('impresion:guardarConfig', config), 'Guardado.')
              }
            >
              Guardar
            </button>
            <button
              type="button"
              className="boton"
              onClick={() =>
                // La prueba sale con lo que se ve en pantalla: se guarda antes.
                void intentar(async () => {
                  await llamar('impresion:guardarConfig', config);
                  await llamar('impresion:prueba');
                }, 'Guardado. Prueba enviada.')
              }
            >
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
        </fieldset>
        <section className="modulo" aria-labelledby="hoja-qr">
          <h2 id="hoja-qr" className="modulo__titulo">
            QR de las mesas
          </h2>
          <p className="suave">
            Una hoja A4 con la tarjeta de cada mesa para recortar y poner en la mesa.
          </p>
          <button
            type="button"
            className="boton"
            onClick={() =>
              void llamar('mesas:hojaQr')
                .then((guardado) => {
                  setError(null);
                  setOk(
                    guardado
                      ? 'Hoja de QR guardada. Imprimila en A4 y recortá cada tarjeta.'
                      : null,
                  );
                })
                .catch((e: unknown) => {
                  setOk(null);
                  setError(mensajeDe(e));
                })
            }
          >
            QR de las mesas (PDF)
          </button>
        </section>
      </div>
      <section className="modulo" aria-labelledby="ultimos">
        <h2 id="ultimos" className="modulo__titulo">
          Últimos tickets
        </h2>
        {!recientes.length ? (
          <p className="suave">Todavía no se imprimió nada.</p>
        ) : (
          <table className="tabla tabla--plana" aria-label="Últimos tickets">
            <thead>
              <tr>
                <th scope="col" className="tabla__texto">
                  Hora
                </th>
                <th scope="col" className="tabla__texto">
                  Ticket
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {recientes.map((t) => (
                <tr key={t.id}>
                  <td className="cifra">{hora(t.creadaEn)}</td>
                  <td className="tabla__texto">{t.titulo}</td>
                  <td>
                    <span
                      className={
                        t.estado === 'error'
                          ? 'etiqueta etiqueta--pendiente'
                          : t.estado === 'impresa'
                            ? 'etiqueta'
                            : 'etiqueta etiqueta--cuenta'
                      }
                    >
                      {ESTADOS[t.estado]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
