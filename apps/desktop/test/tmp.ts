import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

/** Carpeta temporal por archivo de test; se borra al terminar (lo que siga abierto en Windows queda). */
export function carpetaTemporal() {
  const dir = mkdtempSync(join(tmpdir(), 'gula-desktop-'));
  const borrar = () => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
    } catch {
      // Una base todavía abierta no se puede borrar en Windows; no hace fallar los tests.
    }
  };
  afterAll(borrar);
  return { dir, ruta: (n: string) => join(dir, n), borrar };
}
