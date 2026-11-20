/** Íconos de carta y caja: trazo cuadrado de 2.25 px, mismo peso en todos. */
const trazo = { stroke: 'currentColor', strokeWidth: 2.25, strokeLinecap: 'square' as const, fill: 'none' };

export function IconoMas() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2v12M2 8h12" {...trazo} />
    </svg>
  );
}
export function IconoMenos() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 8h12" {...trazo} />
    </svg>
  );
}
export function IconoCerrar() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 3l12 12M15 3L3 15" {...trazo} />
    </svg>
  );
}
export function IconoTilde() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 7.5l3 3 6-7" {...trazo} strokeLinecap="butt" />
    </svg>
  );
}
const FLECHAS = { izq: 'M10 3 5 8l5 5', der: 'm6 3 5 5-5 5', arriba: 'M3 10l5-5 5 5', abajo: 'M3 6l5 5 5-5' } as const;
export function IconoFlecha({ hacia }: { hacia: keyof typeof FLECHAS }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={FLECHAS[hacia]} {...trazo} />
    </svg>
  );
}
