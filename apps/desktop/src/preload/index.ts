import { contextBridge, ipcRenderer } from 'electron';
import type { CanalServicio, EventoGula, PuenteGula } from '../compartido/ipc';

const puente: PuenteGula = {
  invocar: (canal: CanalServicio, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args),
  escuchar: (evento: EventoGula, fn: (dato: unknown) => void) => {
    const oyente = (_e: Electron.IpcRendererEvent, dato: unknown) => fn(dato);
    ipcRenderer.on(`evento:${evento}`, oyente);
    return () => ipcRenderer.removeListener(`evento:${evento}`, oyente);
  },
} as PuenteGula;

contextBridge.exposeInMainWorld('gula', puente);
