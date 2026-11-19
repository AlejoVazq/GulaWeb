import { validarCampoMarca, type CampoMarca } from '@gula/shared';
import { ErrorApi } from '../errores.js';

export type ValoresMarca = Partial<Record<CampoMarca, string>>;

/** Aplica los valores del CLI sobre la marca guardada; valida cada uno con las reglas compartidas. */
export function aplicarMarca(actual: Record<string, unknown>, valores: ValoresMarca): Record<string, unknown> {
  const marca = { ...actual };
  for (const [campo, valor] of Object.entries(valores) as [CampoMarca, string | undefined][]) {
    if (valor === undefined) continue;
    const error = validarCampoMarca(campo, valor);
    if (error) throw new ErrorApi(400, 'DATOS_INVALIDOS', error);
    marca[campo === 'color' ? 'colorAcento' : campo] = campo === 'lema' ? valor.trim() : valor;
  }
  return marca;
}
