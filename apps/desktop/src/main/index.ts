import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import type { EventoGula } from '../compartido/ipc';
import { abrirBase } from './db/base';
import { escribirKv, leerKv } from './db/kv';
import { crearSesion, type Cifrador } from './api/sesion';
import { crearCliente } from './api/cliente';
import { crearMotor } from './sync/motor';
import { crearServicios } from './servicios';
import { registrarIpc } from './ipc';
import { esFramePropio, esUrlExternaPermitida } from './seguridad';

const SERVIDOR_POR_DEFECTO = 'http://localhost:3000';

// Carpeta de datos alternativa (tests e2e): GULA_DATOS
if (process.env.GULA_DATOS) app.setPath('userData', process.env.GULA_DATOS);

function cifrador(): Cifrador {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      cifrar: (t) => safeStorage.encryptString(t).toString('base64'),
      descifrar: (t) => safeStorage.decryptString(Buffer.from(t, 'base64')),
    };
  }
  // Sin cifrado del sistema (raro en Windows): se guarda igual, pero se avisa en el log.
  console.warn('safeStorage no disponible: el refresh token se guarda sin cifrar');
  return { cifrar: (t) => t, descifrar: (t) => t };
}

function crearVentana(): BrowserWindow {
  const ventana = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'GulaWeb',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  ventana.once('ready-to-show', () => ventana.show());
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (esUrlExternaPermitida(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // La ventana nunca navega fuera de la app (una página remota tendría acceso a window.gula).
  ventana.webContents.on('will-navigate', (e, url) => {
    if (!esFramePropio(url, process.env.ELECTRON_RENDERER_URL)) e.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) void ventana.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void ventana.loadFile(join(__dirname, '../renderer/index.html'));
  return ventana;
}

const unicaInstancia = app.requestSingleInstanceLock();
if (!unicaInstancia) app.quit();

void app.whenReady().then(() => {
  if (!unicaInstancia) return;
  const base = abrirBase(join(app.getPath('userData'), 'gula.db'));
  const servidor = () => process.env.GULA_SERVIDOR ?? leerKv(base, 'servidor') ?? SERVIDOR_POR_DEFECTO;
  const sesion = crearSesion(base, cifrador());
  const cliente = crearCliente({ urlBase: servidor, sesion });

  let emitir: (e: EventoGula, d: unknown) => void = () => {};
  const motor = crearMotor({ base, cliente, alCambiarCarta: () => emitir('carta:cambio', null) });
  motor.on('estado', (e) => emitir('sync:estado', e));

  const servicios = crearServicios({
    base,
    sesion,
    cliente,
    motor,
    emitir: (e, d) => emitir(e, d),
    servidor,
    fijarServidor: (url) => escribirKv(base, 'servidor', url.replace(/\/$/, '')),
    elegirArchivo: async () => {
      const r = await dialog.showOpenDialog({
        title: 'Elegí la foto del producto',
        properties: ['openFile'],
        filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
  });
  cliente.on('sesion-cerrada', () => {
    motor.detener();
    emitir('sesion:cambio', { tipo: 'sin-dispositivo', servidor: servidor() });
  });

  const { emitirA } = registrarIpc(servicios);
  const ventana = crearVentana();
  emitir = emitirA(ventana);
  if (sesion.actual()) motor.iniciar();

  app.on('before-quit', () => motor.detener());
  // La base se cierra al final, cuando ya no puede haber escrituras del motor en curso.
  app.on('will-quit', () => base.cerrar());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
