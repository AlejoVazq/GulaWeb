import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
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
  const cifradorSistema = cifrador();
  const sesion = crearSesion(base, cifradorSistema);
  const cliente = crearCliente({ urlBase: servidor, sesion });

  let emitir: (e: EventoGula, d: unknown) => void = () => {};
  const motor = crearMotor({
    base,
    cliente,
    alCambiarCarta: () => emitir('carta:cambio', null),
    alCambiarSalon: () => emitir('salon:cambio', null),
    alCambiarCaja: () => emitir('caja:cambio', null),
  });
  motor.on('estado', (e) => emitir('sync:estado', e));

  let ventana: BrowserWindow | null = null;
  const servicios = crearServicios({
    base,
    cifrador: cifradorSistema,
    listarImpresoras: async () => (ventana ? (await ventana.webContents.getPrintersAsync()).map((p) => p.name) : []),
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
    guardarArchivo: async (nombre, datos) => {
      const ext = nombre.slice(nombre.lastIndexOf('.') + 1);
      const r = await dialog.showSaveDialog({
        title: 'Guardar reporte',
        defaultPath: join(app.getPath('documents'), nombre),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (r.canceled || !r.filePath) return false;
      await writeFile(r.filePath, datos);
      return true;
    },
    htmlAPdf: async (html) => {
      // Ventana oculta, sin JavaScript ni acceso a la app: solo dibuja el HTML para imprimirlo.
      const v = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
      try {
        await v.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        return new Uint8Array(await v.webContents.printToPDF({ pageSize: 'A4', printBackground: true }));
      } finally {
        v.destroy();
      }
    },
  });
  cliente.on('sesion-cerrada', () => {
    motor.detener();
    emitir('sesion:cambio', { tipo: 'sin-dispositivo', servidor: servidor() });
  });

  const { emitirA } = registrarIpc(servicios);
  ventana = crearVentana();
  emitir = emitirA(ventana);
  if (sesion.actual()) motor.iniciar();
  // Lo que quedó a medio imprimir en un cierre inesperado pasa a error; lo pendiente sale.
  ventana.webContents.once('did-finish-load', () => servicios.recuperarImpresion());

  app.on('before-quit', () => motor.detener());
  // La base se cierra al final, cuando ya no puede haber escrituras del motor en curso.
  app.on('will-quit', () => base.cerrar());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
