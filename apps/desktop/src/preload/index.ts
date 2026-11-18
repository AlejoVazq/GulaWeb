import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('gula', { version: '0.1.0' });
