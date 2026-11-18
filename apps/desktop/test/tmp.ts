import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function carpetaTemporal() {
  const dir = mkdtempSync(join(tmpdir(), 'gula-desktop-'));
  return { dir, ruta: (n: string) => join(dir, n), borrar: () => rmSync(dir, { recursive: true, force: true }) };
}
