import type { ErrorGulaDatos } from '../compartido/ipc';
import { ErrorApiCliente, SinConexion } from './api/cliente';

export class ErrorGula extends Error implements ErrorGulaDatos {
  constructor(
    public readonly codigo: string,
    public readonly mensaje: string,
  ) {
    super(mensaje);
  }
}

export const sinConexion = (mensaje = 'No hay conexión con el servidor.') => new ErrorGula('SIN_CONEXION', mensaje);

/** Convierte cualquier error en { codigo, mensaje } para cruzar IPC (sin stack). */
export function aDatos(e: unknown): ErrorGulaDatos {
  if (e instanceof ErrorGula) return { codigo: e.codigo, mensaje: e.mensaje };
  if (e instanceof ErrorApiCliente) return { codigo: e.codigo, mensaje: e.mensaje };
  if (e instanceof SinConexion) return { codigo: 'SIN_CONEXION', mensaje: 'No hay conexión con el servidor.' };
  return { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' };
}
