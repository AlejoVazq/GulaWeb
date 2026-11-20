import { useCallback, useEffect, useState } from 'react';
import type { ConfigImpresion } from '../../compartido/impresion';
import { escuchar, llamar } from '../gula';

/** En el cartel: dónde sale lo impreso. Los errores los avisa la franja roja de AvisoImpresion. */
export function EstadoImpresora() {
  const [config, setConfig] = useState<ConfigImpresion | null>(null);
  const leer = useCallback(() => {
    void llamar('impresion:config')
      .then(({ modo, impresora, columnas }) => setConfig({ modo, impresora, columnas }))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    leer();
    return escuchar('impresion:cambio', leer);
  }, [leer]);
  if (!config) return null;
  const [texto, tono] =
    config.modo === 'vista_previa'
      ? ['Vista previa en pantalla', 'neutro']
      : config.impresora
        ? ['Impresora lista', 'ok']
        : ['Sin impresora elegida', 'aviso'];
  return (
    <span className={`estado-impresora estado-impresora--${tono}`} title={config.impresora ?? undefined}>
      <span className="conexion__punto" aria-hidden="true" />
      {texto}
    </span>
  );
}
