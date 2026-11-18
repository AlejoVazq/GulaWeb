/** "2.500,50" | "2500" | "$ 12.000" → centavos. Devuelve null si no es un monto válido ≥ 0. */
export function parsearPesos(texto: string): number | null {
  const t = texto.replace(/\$/g, '').replace(/\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [enteros, dec = ''] = t.replace(/\./g, '').split(',');
  return Number(enteros) * 100 + Number(dec.padEnd(2, '0'));
}

/** 250050 → "2500,50" (formato para editar). */
export function centavosAPesos(c: number): string {
  const pesos = Math.floor(c / 100);
  const resto = c % 100;
  return resto ? `${pesos},${String(resto).padStart(2, '0')}` : String(pesos);
}
