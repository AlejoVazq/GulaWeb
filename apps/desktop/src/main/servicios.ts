import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { puede, type Accion } from '@gula/shared';
import type { EdicionCarta, EstadoSesion, EventoGula, ServiciosGula, UsuarioPublico } from '../compartido/ipc';
import type { BaseLocal } from './db/base';
import { fijarDisponibilidadLocal, leerCarta, vaciarCartaLocal } from './db/carta';
import { encolar, vaciarOutbox } from './db/outbox';
import { vaciarSalonLocal } from './db/salon';
import { vaciarCajaLocal } from './db/caja';
import { crearServiciosSalon } from './servicios.salon';
import { borrarKv, escribirKv, leerKv } from './db/kv';
import type { Sesion } from './api/sesion';
import { SinConexion, type Cliente } from './api/cliente';
import type { Motor } from './sync/motor';
import { ErrorGula, sinConexion } from './errores';
import { crearColaImpresion, type ColaImpresion } from './impresion/cola';
import { crearTransporteWindows } from './impresion/windows';
import { crearServiciosImpresion } from './servicios.impresion';

type Deps = {
  base: BaseLocal;
  sesion: Sesion;
  cliente: { pedir: Cliente['pedir']; pin: Cliente['pin']; login: (email: string, password: string, nombrePc: string, servidor?: string) => Promise<unknown> };
  motor: Pick<Motor, 'sincronizarAhora' | 'reconectar' | 'iniciar' | 'detener' | 'estado'>;
  emitir: (evento: EventoGula, dato: unknown) => void;
  elegirArchivo: () => Promise<string | null>;
  servidor?: () => string;
  fijarServidor?: (url: string) => void;
  /** Cola de impresión (por defecto: impresora de Windows, eventos por `emitir`). */
  cola?: ColaImpresion;
  listarImpresoras?: () => Promise<string[]>;
};

const TIPOS_IMAGEN: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** Traducción de cada edición de carta a su endpoint REST. */
function aRest(e: EdicionCarta): [metodo: 'POST' | 'PATCH' | 'PUT' | 'DELETE', ruta: string, cuerpo?: object] {
  switch (e.tipo) {
    case 'crearCategoria': return ['POST', '/carta/categorias', e.datos];
    case 'editarCategoria': return ['PATCH', `/carta/categorias/${e.id}`, e.datos];
    case 'borrarCategoria': return ['DELETE', `/carta/categorias/${e.id}`];
    case 'ordenarCategorias': return ['PUT', '/carta/categorias/orden', { ids: e.ids }];
    case 'crearProducto': return ['POST', '/carta/productos', e.datos];
    case 'editarProducto': return ['PATCH', `/carta/productos/${e.id}`, e.datos];
    case 'borrarProducto': return ['DELETE', `/carta/productos/${e.id}`];
    case 'crearGrupo': return ['POST', `/carta/productos/${e.productoId}/grupos`, e.datos];
    case 'editarGrupo': return ['PATCH', `/carta/grupos/${e.id}`, e.datos];
    case 'borrarGrupo': return ['DELETE', `/carta/grupos/${e.id}`];
    case 'crearOpcion': return ['POST', `/carta/grupos/${e.grupoId}/opciones`, e.datos];
    case 'editarOpcion': return ['PATCH', `/carta/opciones/${e.id}`, e.datos];
    case 'borrarOpcion': return ['DELETE', `/carta/opciones/${e.id}`];
    case 'quitarFoto': return ['DELETE', `/carta/productos/${e.productoId}/foto`];
  }
}

export function crearServicios(d: Deps): ServiciosGula & { bloquearPorInactividad(): void; recuperarImpresion(): void } {
  let desbloqueada = false;

  const estadoSesion = (): EstadoSesion => {
    const s = d.sesion.actual();
    if (!s) return { tipo: 'sin-dispositivo', servidor: d.servidor?.() ?? '' };
    if (!desbloqueada) return { tipo: 'bloqueada', local: s.local };
    return { tipo: 'activa', local: s.local, usuario: s.usuario };
  };
  const avisarSesion = () => {
    const e = estadoSesion();
    d.emitir('sesion:cambio', e);
    return e;
  };
  const exigir = (accion: Accion): string => {
    const s = d.sesion.actual();
    if (!s || !desbloqueada) throw new ErrorGula('SESION_BLOQUEADA', 'Elegí tu usuario para continuar.');
    if (puede(s.usuario.rol, accion) !== 'si') throw new ErrorGula('SIN_PERMISO', 'No tenés permiso para hacer esto.');
    return s.usuario.id;
  };
  const online = async <T>(fn: () => Promise<T>, mensaje: string) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SinConexion) throw sinConexion(mensaje);
      throw e;
    }
  };

  const cola =
    d.cola ??
    crearColaImpresion({
      base: d.base,
      transporte: crearTransporteWindows(),
      alVistaPrevia: (documento, columnas) => d.emitir('impresion:vista', { documento, columnas }),
      alCambiar: () => d.emitir('impresion:cambio', null),
    });
  const impresion = crearServiciosImpresion({
    base: d.base,
    cola,
    exigir,
    quien: () => {
      const s = d.sesion.actual();
      return { local: s?.local.nombre ?? '', usuario: s?.usuario.nombre ?? '' };
    },
    listarImpresoras: d.listarImpresoras ?? (async () => []),
  });

  return {
    ...crearServiciosSalon({
      base: d.base,
      exigir,
      emitir: d.emitir,
      sincronizar: () => void d.motor.sincronizarAhora(),
      alConfirmar: (pedidoId) => impresion.comandas(pedidoId),
    }),
    ...impresion.servicios,
    /** Al iniciar la app: resuelve lo que quedó a medio imprimir. */
    recuperarImpresion: () => cola.recuperar(),

    'sesion:estado': async () => estadoSesion(),

    'sesion:login': async ({ email, password, nombrePc, servidor }) => {
      const localAnterior = d.sesion.actual()?.local.id ?? leerKv(d.base, 'ultimo-local');
      await online(() => d.cliente.login(email, password, nombrePc, servidor), 'No pudimos conectar con el servidor.');
      const localNuevo = d.sesion.actual()?.local.id ?? null;
      // Otro local: nada de lo guardado (carta, cursor, operaciones) le pertenece.
      if (localAnterior && localNuevo && localAnterior !== localNuevo) {
        vaciarCartaLocal(d.base);
        vaciarSalonLocal(d.base);
        vaciarCajaLocal(d.base);
        vaciarOutbox(d.base);
        borrarKv(d.base, 'cursor:carta');
        borrarKv(d.base, 'cursor:salon');
        borrarKv(d.base, 'cursor:caja');
      }
      if (localNuevo) escribirKv(d.base, 'ultimo-local', localNuevo);
      if (servidor) d.fijarServidor?.(servidor);
      desbloqueada = true;
      d.motor.iniciar();
      d.motor.reconectar();
      return avisarSesion();
    },

    'sesion:usuarios': async () =>
      online(() => d.cliente.pedir<UsuarioPublico[]>('GET', '/auth/usuarios'), 'Sin conexión no se puede cambiar de usuario.'),

    'sesion:elegirUsuario': async ({ usuarioId, pin }) => {
      await online(() => d.cliente.pin(usuarioId, pin), 'Sin conexión no se puede cambiar de usuario.');
      desbloqueada = true;
      d.motor.reconectar();
      return avisarSesion();
    },

    'sesion:bloquear': async () => {
      desbloqueada = false;
      return avisarSesion();
    },

    'sesion:cerrar': async () => {
      await d.cliente.pedir('POST', '/auth/logout').catch(() => undefined);
      d.motor.detener();
      d.sesion.borrar();
      desbloqueada = false;
      return avisarSesion();
    },

    'sesion:actividad': async () => undefined,

    'carta:leer': async () => leerCarta(d.base),

    'carta:editar': async (e) => {
      exigir('carta.editar');
      const [metodo, ruta, cuerpo] = aRest(e);
      await online(() => d.cliente.pedir(metodo, ruta, cuerpo), 'Necesitás conexión para editar la carta.');
      await d.motor.sincronizarAhora();
    },

    'carta:disponibilidad': async (c) => {
      exigir('carta.disponibilidad');
      if (!c.productoId === !c.opcionId) throw new ErrorGula('DATOS_INVALIDOS', 'Indicá un producto o una opción.');
      d.base.transaccion(() => {
        fijarDisponibilidadLocal(d.base, c);
        const usuarioId = d.sesion.actual()?.usuario.id;
        encolar(
          d.base,
          c.productoId
            ? { tipo: 'producto.disponibilidad', datos: { productoId: c.productoId, disponible: c.disponible }, usuarioId }
            : { tipo: 'opcion.disponibilidad', datos: { opcionId: c.opcionId, disponible: c.disponible }, usuarioId },
        );
      });
      d.emitir('carta:cambio', null);
      void d.motor.sincronizarAhora();
    },

    'carta:subirFoto': async ({ productoId }) => {
      exigir('carta.editar');
      const ruta = await d.elegirArchivo();
      if (!ruta) return false;
      const ext = ruta.slice(ruta.lastIndexOf('.')).toLowerCase();
      const tipo = TIPOS_IMAGEN[ext];
      if (!tipo) throw new ErrorGula('IMAGEN_INVALIDA', 'Elegí una imagen JPG, PNG o WebP.');
      const form = new FormData();
      form.append('foto', new Blob([await readFile(ruta)], { type: tipo }), basename(ruta));
      await online(() => d.cliente.pedir('PUT', `/carta/productos/${productoId}/foto`, form), 'Necesitás conexión para subir fotos.');
      await d.motor.sincronizarAhora();
      return true;
    },

    'sync:estado': async () => d.motor.estado(),

    /** Bloqueo automático por inactividad; sin conexión no se bloquea (no se podría volver a entrar). */
    bloquearPorInactividad() {
      if (!desbloqueada || d.motor.estado().conexion === 'sin-conexion') return;
      desbloqueada = false;
      avisarSesion();
    },
  };
}

export type Servicios = ReturnType<typeof crearServicios>;
