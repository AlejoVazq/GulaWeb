import { ipcMain, type BrowserWindow } from 'electron';
import { CANALES, type EventoGula, type Sobre } from '../compartido/ipc';
import { aDatos } from './errores';
import { esFramePropio } from './seguridad';
import type { Servicios } from './servicios';
import { crearVigia } from './vigia';

export const MINUTOS_BLOQUEO = 5;

/** Registra un handler por canal. Cada respuesta es un Sobre (los errores cruzan como datos). */
export function registrarIpc(servicios: Servicios): { emitirA: (v: BrowserWindow) => (e: EventoGula, d: unknown) => void } {
  const vigia = crearVigia(MINUTOS_BLOQUEO);
  for (const canal of CANALES) {
    ipcMain.handle(canal, async (evento, ...args: unknown[]): Promise<Sobre<unknown>> => {
      // Solo la propia app puede usar el puente (nunca una página remota cargada por error).
      if (!evento.senderFrame || !esFramePropio(evento.senderFrame.url, process.env.ELECTRON_RENDERER_URL)) {
        return { ok: false, error: { codigo: 'PROHIBIDO', mensaje: 'Origen no permitido.' } };
      }
      vigia.registrar(canal);
      try {
        const fn = servicios[canal] as (...a: unknown[]) => Promise<unknown>;
        return { ok: true, valor: await fn(...args) };
      } catch (e) {
        return { ok: false, error: aDatos(e) };
      }
    });
  }
  setInterval(() => {
    if (vigia.inactivo()) servicios.bloquearPorInactividad();
  }, 30_000).unref();

  return {
    emitirA: (v) => (evento, dato) => {
      if (!v.isDestroyed()) v.webContents.send(`evento:${evento}`, dato);
    },
  };
}
