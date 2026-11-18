const formato = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 'HH:MM' de `ahora` en Buenos Aires. */
export function horaBA(ahora: Date): string {
  return formato.format(ahora);
}

/** ¿`ahora` cae en [desde, hasta)? Si desde > hasta, el horario cruza medianoche. */
export function enHorario(desde: string | null, hasta: string | null, ahora: Date): boolean {
  if (!desde || !hasta) return true;
  const h = horaBA(ahora);
  return desde < hasta ? h >= desde && h < hasta : h >= desde || h < hasta;
}
