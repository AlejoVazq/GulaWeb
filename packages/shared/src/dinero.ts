const miles = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

/** 250050 → "$ 2.500,50"; 250000 → "$ 2.500". Los montos siempre son centavos enteros. */
export function formatearPrecio(centavos: number): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centavos));
  const pesos = Math.floor(abs / 100);
  const resto = abs % 100;
  const texto = miles.format(pesos).replace(/\s/g, '.');
  return `${signo}$ ${texto}${resto ? `,${String(resto).padStart(2, '0')}` : ''}`;
}
