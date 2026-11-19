/** '2026-11-18T21:05:00Z' → '18:05' (hora local de la PC). */
export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
