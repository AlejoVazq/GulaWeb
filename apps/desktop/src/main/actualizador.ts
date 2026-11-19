import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { EstadoActualizacion } from '../compartido/ipc';

const CADA = 4 * 60 * 60 * 1000;

/**
 * Busca actualizaciones en el VPS al arrancar y cada 4 h, las baja en segundo plano y las instala
 * recién cuando se cierra la app (nunca en medio del servicio). Solo en la app instalada.
 */
export function crearActualizador(avisar: (e: EstadoActualizacion) => void) {
  let estado: EstadoActualizacion = { tipo: 'al-dia', version: app.getVersion() };
  const fijar = (e: EstadoActualizacion) => {
    estado = e;
    avisar(e);
  };
  if (!app.isPackaged || process.env.GULA_SIN_ACTUALIZAR) {
    return { estado: () => estado, instalarAhora: () => {} };
  }
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', (p) => fijar({ tipo: 'bajando', porcentaje: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => fijar({ tipo: 'lista', version: i.version }));
  // Sin red o VPS caído: no es un problema para operar; se reintenta en el próximo ciclo.
  autoUpdater.on('error', (e) => console.warn('actualización:', e.message));
  const buscar = () => void autoUpdater.checkForUpdates().catch(() => {});
  buscar();
  setInterval(buscar, CADA).unref();
  return {
    estado: () => estado,
    /** Cierra la app e instala (solo cuando la usuaria lo pide). */
    instalarAhora: () => {
      if (estado.tipo === 'lista') autoUpdater.quitAndInstall(false, true);
    },
  };
}
