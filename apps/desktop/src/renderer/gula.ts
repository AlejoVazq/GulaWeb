import type { CanalServicio, EventoGula, PuenteGula, ServiciosGula } from '../compartido/ipc';

declare global {
  interface Window {
    gula: PuenteGula;
  }
}

export class ErrorGula extends Error {
  constructor(
    public readonly codigo: string,
    public readonly mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Llama a un servicio de main y desenvuelve el Sobre (lanza ErrorGula si falló). */
export async function llamar<C extends CanalServicio>(
  canal: C,
  ...args: Parameters<ServiciosGula[C]>
): Promise<Awaited<ReturnType<ServiciosGula[C]>>> {
  const r = await window.gula.invocar(canal, ...args);
  if (!r.ok) throw new ErrorGula(r.error.codigo, r.error.mensaje);
  return r.valor;
}

export const escuchar = (evento: EventoGula, fn: (dato: unknown) => void) => window.gula.escuchar(evento, fn);

export const mensajeDe = (e: unknown) => (e instanceof ErrorGula ? e.mensaje : 'Ocurrió un error inesperado.');
