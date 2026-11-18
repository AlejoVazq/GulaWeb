import { v7, validate } from 'uuid';

/** Genera un UUIDv7 (ordenable por tiempo, monotónico en el mismo ms). */
export function nuevoId(): string {
  return v7();
}

export function esId(valor: unknown): valor is string {
  return typeof valor === 'string' && validate(valor);
}
