import { ipcMain, type BrowserWindow } from 'electron';
import { CANALES, type EventoGula, type Sobre } from '../compartido/ipc';
import { aDatos } from './errores';
import type { Servicios } from './servicios';

export const MINUTOS_BLOQUEO = 5;

/** Registra un handler por canal. Cada respuesta es un Sobre (los errores cruzan como datos). */
export function registrarIpc(servicios: Servicios): { emitirA: (v: BrowserWindow) => (e: EventoGula, d: unknown) => void } {
  let ultimaActividad = Date.now();
  for (const canal of CANALES) {
    ipcMain.handle(canal, async (_evento, ...args: unknown[]): Promise<Sobre<unknown>> => {
      ultimaActividad = Date.now();
      try {
        const fn = servicios[canal] as (...a: unknown[]) => Promise<unknown>;
        return { ok: true, valor: await fn(...args) };
      } catch (e) {
        return { ok: false, error: aDatos(e) };
      }
    });
  }
  setInterval(() => {
    if (Date.now() - ultimaActividad > MINUTOS_BLOQUEO * 60_000) servicios.bloquearPorInactividad();
  }, 30_000).unref();

  return {
    emitirA: (v) => (evento, dato) => {
      if (!v.isDestroyed()) v.webContents.send(`evento:${evento}`, dato);
    },
  };
}
