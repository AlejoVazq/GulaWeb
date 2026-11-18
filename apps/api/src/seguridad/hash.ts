import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';

// Argon2id con parámetros OWASP (m=19 MiB, t=2, p=1).
const opciones = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashear(secreto: string): Promise<string> {
  return hash(secreto, opciones);
}

export async function verificarHash(hashGuardado: string, secreto: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, secreto);
  } catch {
    return false;
  }
}

export function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}
