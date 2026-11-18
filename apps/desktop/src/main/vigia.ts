import type { CanalServicio } from '../compartido/ipc';

/** Canales que significan que una persona está usando la PC (las lecturas automáticas no cuentan). */
const DE_USUARIO = new Set<CanalServicio>([
  'sesion:actividad',
  'sesion:login',
  'sesion:elegirUsuario',
  'carta:editar',
  'carta:disponibilidad',
  'carta:subirFoto',
]);

export function crearVigia(minutos: number, ahora: () => number = Date.now) {
  let ultima = ahora();
  return {
    registrar(canal: CanalServicio) {
      if (DE_USUARIO.has(canal)) ultima = ahora();
    },
    inactivo: () => ahora() - ultima > minutos * 60_000,
  };
}
