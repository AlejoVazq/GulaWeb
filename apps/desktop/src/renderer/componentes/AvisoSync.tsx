import { useEffect, useState } from 'react';
import type { EstadoSync, OperacionRechazada } from '../../compartido/ipc';
import { describirRechazo } from '../../compartido/rechazos';
import { escuchar, llamar } from '../gula';

const UMBRAL_RELOJ_MS = 5 * 60_000;

/** En la barra, para todos: cambios que el servidor no aceptó y la hora de la PC mal puesta. */
export function AvisoSync({ sync }: { sync: EstadoSync }) {
  const [lista, setLista] = useState<OperacionRechazada[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const cargar = () =>
      void llamar('sync:rechazadas')
        .then((l) => setLista(l ?? []))
        .catch(() => undefined);
    cargar();
    const a = escuchar('caja:cambio', cargar);
    const b = escuchar('sync:estado', cargar);
    return () => {
      a();
      b();
    };
  }, []);

  const desfase = sync.desfaseReloj ?? 0;
  const relojMal = Math.abs(desfase) > UMBRAL_RELOJ_MS;
  const n = lista.length;

  const entendido = async () => {
    const ids = lista.map((o) => o.id);
    setAbierto(false);
    setLista([]);
    for (const id of ids) await llamar('sync:descartarRechazada', { id }).catch(() => undefined);
  };

  return (
    <>
      {relojMal && (
        <span role="alert" className="aviso-sync aviso-sync--reloj">
          La hora de esta PC está mal (diferencia de {Math.round(Math.abs(desfase) / 60_000)} min). Corregila en Windows.
        </span>
      )}
      {n > 0 && (
        <span className="aviso-sync">
          <button type="button" className="boton boton--peligro" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
            {n === 1 ? '1 cambio no se guardó' : `${n} cambios no se guardaron`}
          </button>
          {abierto && (
            <div role="dialog" aria-label="Cambios que no se guardaron" className="aviso-sync__panel">
              <p className="suave">El servidor no aceptó estos cambios. Revisá y cargalos de nuevo si corresponde.</p>
              <ul className="lista">
                {lista.map((o) => (
                  <li key={o.id} className="lista__item">
                    {describirRechazo(o)}
                  </li>
                ))}
              </ul>
              <button type="button" className="boton boton--principal" onClick={() => void entendido()}>
                Entendido
              </button>
            </div>
          )}
        </span>
      )}
    </>
  );
}
