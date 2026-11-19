import { useEffect, useState } from 'react';
import type { EstadoActualizacion } from '../../compartido/ipc';
import { escuchar, llamar } from '../gula';

/** En la barra: hay versión nueva descargada. Se instala sola al cerrar; o ahora, si se elige. */
export function AvisoActualizacion() {
  const [estado, setEstado] = useState<EstadoActualizacion | null>(null);

  useEffect(() => {
    void llamar('app:actualizacion')
      .then((e) => setEstado(e ?? null))
      .catch(() => undefined);
    return escuchar('app:actualizacion', (e) => setEstado(e as EstadoActualizacion));
  }, []);

  if (estado?.tipo !== 'lista') return null;
  return (
    <span className="aviso-actualizacion" role="status">
      Versión {estado.version} lista (se instala al cerrar).{' '}
      <button type="button" className="boton boton--chico" onClick={() => void llamar('app:instalarActualizacion')}>
        Reiniciar ahora
      </button>
    </span>
  );
}
