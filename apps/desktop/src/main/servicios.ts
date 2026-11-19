import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { puede, type Accion } from '@gula/shared';
import type { EdicionCarta, EstadoSesion, EventoGula, ServiciosGula, UsuarioPublico } from '../compartido/ipc';
import type { BaseLocal } from './db/base';
import { fijarDisponibilidadLocal, leerCarta, vaciarCartaLocal } from './db/carta';
import { borrarRechazada, encolar, leerRechazadas, vaciarOutbox } from './db/outbox';
import { vaciarSalonLocal } from './db/salon';
import { vaciarCajaLocal } from './db/caja';
import { crearServiciosSalon } from './servicios.salon';
import { borrarKv, escribirKv, leerKv } from './db/kv';
import type { Cifrador, Sesion, UsuarioSesion } from './api/sesion';
import { crearPinLocal } from './pinLocal';
import { ErrorApiCliente, SinConexion, type Cliente } from './api/cliente';
import { crearServiciosCaja } from './servicios.caja';
import { crearServiciosDelivery } from './servicios.delivery';
import { crearServiciosReportes } from './servicios.reportes';
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
  /** Exportar reportes: diálogo "Guardar como" (false si se cancela) y HTML → PDF. */
  guardarArchivo?: (nombreSugerido: string, datos: Uint8Array | string) => Promise<boolean>;
  htmlAPdf?: (html: string) => Promise<Uint8Array>;
  /** Cifra los verificadores de PIN locales (el mismo cifrador del refresh token). */
  cifrador?: Cifrador;
};

/** La mesa a la que se refiere una operación ("Mesa 4"), buscándola por mesa, sesión, pedido o ítem. */
function lugarDe(base: BaseLocal, datos: unknown): string | null {
  const x = (datos ?? {}) as Record<string, unknown>;
  const uno = (sql: string, id: unknown) =>
    typeof id === 'string' ? ((base.db.prepare(sql).get(id) as { n: string | null } | undefined)?.n ?? null) : null;
  const porSesion = (id: unknown) =>
    uno('SELECT m.nombre AS n FROM sesiones s JOIN mesas m ON m.id = s.mesa_id WHERE s.id = ?', id);
  const porPedido = (id: unknown) =>
    uno(
      `SELECT m.nombre AS n FROM pedidos p
         LEFT JOIN sesiones s ON s.id = p.sesion_id
         JOIN mesas m ON m.id = COALESCE(p.mesa_id, s.mesa_id) WHERE p.id = ?`,
      id,
    );
  return (
    uno('SELECT nombre AS n FROM mesas WHERE id = ?', x.mesaId) ??
    porSesion(x.sesionId) ??
    porPedido(x.pedidoId) ??
    porPedido(uno('SELECT pedido_id AS n FROM items WHERE id = ?', x.itemId))
  );
}

const SIN_VERIFICADOR = 'Ese usuario todavía no entró en esta PC con conexión.';

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
  /** Usuario elegido sin conexión (el token sigue siendo del último que entró con red). */
  let usuarioOffline: UsuarioSesion | null = null;
  const pinLocal = crearPinLocal(d.base, d.cifrador ?? { cifrar: (t) => t, descifrar: (t) => t });

  const usuarioActivo = (): UsuarioSesion | null => usuarioOffline ?? d.sesion.actual()?.usuario ?? null;
  const usuariosGuardados = () => JSON.parse(leerKv(d.base, 'usuarios') ?? '[]') as UsuarioPublico[];

  const estadoSesion = (): EstadoSesion => {
    const s = d.sesion.actual();
    if (!s) return { tipo: 'sin-dispositivo', servidor: d.servidor?.() ?? '' };
    if (!desbloqueada) return { tipo: 'bloqueada', local: s.local };
    return { tipo: 'activa', local: s.local, usuario: usuarioActivo()! };
  };
  const avisarSesion = () => {
    const e = estadoSesion();
    d.emitir('sesion:cambio', e);
    return e;
  };
  const activoOFalla = (): UsuarioSesion => {
    const u = usuarioActivo();
    if (!u || !d.sesion.actual() || !desbloqueada) throw new ErrorGula('SESION_BLOQUEADA', 'Elegí tu usuario para continuar.');
    return u;
  };
  const exigir = (accion: Accion): string => {
    const u = activoOFalla();
    if (puede(u.rol, accion) !== 'si') throw new ErrorGula('SIN_PERMISO', 'No tenés permiso para hacer esto.');
    return u.id;
  };
  const permiso = (accion: Accion) => {
    const u = activoOFalla();
    return { usuarioId: u.id, permiso: puede(u.rol, accion) };
  };
  const autorizar = async (a: { usuarioId: string; pin: string }, accion: Accion) => {
    try {
      await d.cliente.pedir('POST', '/auth/autorizar', { usuarioId: a.usuarioId, pin: a.pin, accion });
      pinLocal.recordar(a.usuarioId, a.pin);
    } catch (e) {
      if (e instanceof SinConexion) {
        // Sin verificador local: lo verifica el servidor al sincronizar.
        const r = pinLocal.verificar(a.usuarioId, a.pin);
        if (r === 'incorrecto') throw new ErrorGula('REQUIERE_AUTORIZACION', 'PIN incorrecto.');
        if (r === 'bloqueado') throw new ErrorGula('PIN_BLOQUEADO', 'Demasiados intentos. Esperá 5 minutos.');
        return;
      }
      if (e instanceof ErrorApiCliente) {
        if (e.codigo === 'PIN_INCORRECTO' || e.codigo === 'REQUIERE_AUTORIZACION') pinLocal.olvidar(a.usuarioId);
        throw new ErrorGula('REQUIERE_AUTORIZACION', e.mensaje);
      }
      throw e;
    }
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
      return { local: s?.local.nombre ?? '', usuario: usuarioActivo()?.nombre ?? '' };
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
    ...crearServiciosCaja({
      base: d.base,
      exigir,
      permiso,
      autorizar,
      usuarios: () => d.cliente.pedir<UsuarioPublico[]>('GET', '/auth/usuarios'),
      emitir: d.emitir,
      sincronizar: () => void d.motor.sincronizarAhora(),
      imprimirAnulacion: (pedidoId, itemIds, motivo) => impresion.anulacion(pedidoId, itemIds, motivo),
      imprimirCierre: (t, r) => impresion.cierre(t, r),
    }),
    ...crearServiciosDelivery({
      base: d.base,
      exigir,
      emitir: d.emitir,
      sincronizar: () => void d.motor.sincronizarAhora(),
      alCrear: (pedidoId) => {
        impresion.comandas(pedidoId);
        impresion.delivery(pedidoId);
      },
    }),
    ...crearServiciosReportes({
      exigir,
      pedir: (metodo, ruta) => d.cliente.pedir(metodo, ruta),
      local: () => d.sesion.actual()?.local.nombre ?? '',
      guardarArchivo: d.guardarArchivo ?? (async () => false),
      htmlAPdf: d.htmlAPdf ?? (async () => new Uint8Array()),
    }),
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
      usuarioOffline = null;
      desbloqueada = true;
      d.motor.iniciar();
      d.motor.reconectar();
      return avisarSesion();
    },

    'sesion:usuarios': async () => {
      try {
        const lista = await d.cliente.pedir<UsuarioPublico[]>('GET', '/auth/usuarios');
        escribirKv(d.base, 'usuarios', JSON.stringify(lista));
        pinLocal.conservarSolo(lista.map((u) => u.id));
        return lista;
      } catch (e) {
        if (!(e instanceof SinConexion)) throw e;
        // Sin conexión: la última lista, solo con quienes ya entraron en esta PC.
        return usuariosGuardados().filter((u) => pinLocal.tiene(u.id));
      }
    },

    'sesion:elegirUsuario': async ({ usuarioId, pin }) => {
      try {
        await d.cliente.pin(usuarioId, pin);
        pinLocal.recordar(usuarioId, pin);
        usuarioOffline = null;
      } catch (e) {
        if (e instanceof ErrorApiCliente && e.codigo === 'PIN_INCORRECTO') pinLocal.olvidar(usuarioId);
        if (!(e instanceof SinConexion)) throw e;
        const r = pinLocal.verificar(usuarioId, pin);
        if (r === 'sin_verificador') throw sinConexion(SIN_VERIFICADOR);
        if (r === 'incorrecto') throw new ErrorGula('PIN_INCORRECTO', 'PIN incorrecto.');
        if (r === 'bloqueado') throw new ErrorGula('PIN_BLOQUEADO', 'Demasiados intentos. Esperá 5 minutos.');
        const actual = d.sesion.actual()?.usuario;
        const u = actual?.id === usuarioId ? actual : usuariosGuardados().find((x) => x.id === usuarioId);
        if (!u) throw sinConexion(SIN_VERIFICADOR);
        usuarioOffline = actual?.id === usuarioId ? null : { id: u.id, nombre: u.nombre, rol: u.rol };
      }
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
      usuarioOffline = null;
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
        const usuarioId = usuarioActivo()?.id;
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

    'sync:rechazadas': async () => leerRechazadas(d.base).map((o) => ({ ...o, lugar: lugarDe(d.base, o.datos) })),

    'sync:descartarRechazada': async ({ id }) => {
      exigir('pedido.ver');
      borrarRechazada(d.base, id);
      d.emitir('caja:cambio', null);
      d.emitir('sync:estado', d.motor.estado());
    },

    /** Bloqueo automático por inactividad; sin conexión solo si se puede volver a entrar con el PIN local. */
    bloquearPorInactividad() {
      if (!desbloqueada) return;
      const u = usuarioActivo();
      if (d.motor.estado().conexion === 'sin-conexion' && !(u && pinLocal.tiene(u.id))) return;
      desbloqueada = false;
      avisarSesion();
    },
  };
}

export type Servicios = ReturnType<typeof crearServicios>;
