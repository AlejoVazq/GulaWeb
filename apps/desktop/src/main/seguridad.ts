/** Solo https sale al navegador del sistema (nunca file:, javascript:, etc.). */
export function esUrlExternaPermitida(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** ¿El frame que llama por IPC es la propia app? (archivo local empaquetado o el dev server). */
export function esFramePropio(frameUrl: string, rendererUrl: string | undefined): boolean {
  try {
    const u = new URL(frameUrl);
    if (rendererUrl) return u.origin === new URL(rendererUrl).origin;
    return u.protocol === 'file:';
  } catch {
    return false;
  }
}
