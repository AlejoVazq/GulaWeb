let contexto: AudioContext | null = null;

/** Aviso corto de dos tonos (Web Audio, sin archivos). Si el sistema no tiene audio, no hace nada. */
export function sonarAviso(): void {
  try {
    contexto ??= new AudioContext();
    const t = contexto.currentTime;
    for (const [frecuencia, inicio] of [
      [880, 0],
      [660, 0.18],
    ] as const) {
      const osc = contexto.createOscillator();
      const vol = contexto.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, t + inicio);
      vol.gain.exponentialRampToValueAtTime(0.4, t + inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + inicio + 0.16);
      osc.connect(vol).connect(contexto.destination);
      osc.start(t + inicio);
      osc.stop(t + inicio + 0.17);
    }
  } catch {
    // Sin audio disponible: queda la alerta visual.
  }
}
