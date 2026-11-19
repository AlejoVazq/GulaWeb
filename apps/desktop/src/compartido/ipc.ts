import type { UsuarioPublico } from './usuarios';
import type { Seleccion } from '@gula/shared';
import type { CartaLocal } from './tipos';
import type { Ajuste, DetalleMesa, Pedido, Salon } from './salon';
import type { ConfigImpresion, Documento, TrabajoImpresion } from './impresion';
import type { EstadoCaja, PagoNuevo } from './caja';
import type { CategoriaMovimiento, TipoMovimiento } from '@gula/shared';

export type { UsuarioPublico };
export type LocalInfo = { id: string; nombre: string; slug: string };

export type EstadoSesion =
  | { tipo: 'sin-dispositivo'; servidor: string }
  | { tipo: 'bloqueada'; local: LocalInfo }
  | { tipo: 'activa'; local: LocalInfo; usuario: UsuarioPublico };

export type EstadoSync = {
  conexion: 'en-linea' | 'sin-conexion' | 'sincronizando';
  pendientes: number;
  rechazadas: number;
  ultimaSync: string | null;
};

/** Ediciones de carta (online). Cada una se traduce a una llamada REST en main. */
export type EdicionCarta =
  | { tipo: 'crearCategoria'; datos: { nombre: string; visible?: boolean; horario?: { desde: string; hasta: string } | null } }
  | { tipo: 'editarCategoria'; id: string; datos: { nombre?: string; visible?: boolean; horario?: { desde: string; hasta: string } | null } }
  | { tipo: 'borrarCategoria'; id: string }
  | { tipo: 'ordenarCategorias'; ids: string[] }
  | {
      tipo: 'crearProducto';
      datos: { categoriaId: string; nombre: string; precio: number; descripcion?: string | null; sectorId?: string | null; etiquetas?: string[]; visible?: boolean };
    }
  | {
      tipo: 'editarProducto';
      id: string;
      datos: { categoriaId?: string; nombre?: string; precio?: number; descripcion?: string | null; sectorId?: string | null; etiquetas?: string[]; visible?: boolean };
    }
  | { tipo: 'borrarProducto'; id: string }
  | { tipo: 'crearGrupo'; productoId: string; datos: { nombre: string; min: number; max: number } }
  | { tipo: 'editarGrupo'; id: string; datos: { nombre?: string; min?: number; max?: number } }
  | { tipo: 'borrarGrupo'; id: string }
  | { tipo: 'crearOpcion'; grupoId: string; datos: { nombre: string; recargo?: number } }
  | { tipo: 'editarOpcion'; id: string; datos: { nombre?: string; recargo?: number } }
  | { tipo: 'borrarOpcion'; id: string }
  | { tipo: 'quitarFoto'; productoId: string };

export type CambioDisponibilidad = { productoId?: string; opcionId?: string; disponible: boolean };

export type ErrorGulaDatos = { codigo: string; mensaje: string };
export type Sobre<T> = { ok: true; valor: T } | { ok: false; error: ErrorGulaDatos };

/** Lo que el renderer puede pedirle a main. Todas devuelven un Sobre por IPC. */
export type ServiciosGula = {
  'sesion:estado': () => Promise<EstadoSesion>;
  'sesion:login': (a: { email: string; password: string; nombrePc: string; servidor?: string }) => Promise<EstadoSesion>;
  'sesion:usuarios': () => Promise<UsuarioPublico[]>;
  'sesion:elegirUsuario': (a: { usuarioId: string; pin: string }) => Promise<EstadoSesion>;
  'sesion:bloquear': () => Promise<EstadoSesion>;
  'sesion:cerrar': () => Promise<EstadoSesion>;
  'sesion:actividad': () => Promise<void>;
  'carta:leer': () => Promise<CartaLocal>;
  'carta:editar': (e: EdicionCarta) => Promise<void>;
  'carta:disponibilidad': (c: CambioDisponibilidad) => Promise<void>;
  'carta:subirFoto': (a: { productoId: string }) => Promise<boolean>;
  'sync:estado': () => Promise<EstadoSync>;
  'salon:leer': () => Promise<Salon>;
  'salon:mesa': (mesaId: string) => Promise<DetalleMesa | null>;
  'salon:abrirMesa': (a: { mesaId: string; comensales?: number | null }) => Promise<{ sesionId: string }>;
  'salon:cerrarMesa': (a: { sesionId: string }) => Promise<void>;
  'salon:crearPedido': (a: {
    origen: 'manual' | 'mostrador';
    sesionId?: string;
    notas?: string;
    items: ItemPedido[];
  }) => Promise<{ pedidoId: string; numero: number }>;
  'salon:confirmar': (a: { pedidoId: string; ajustes?: Ajuste[] }) => Promise<{ numero: number }>;
  'salon:rechazar': (a: { pedidoId: string; motivo: string }) => Promise<void>;
  'salon:atenderAviso': (a: { avisoId: string }) => Promise<void>;
  'impresion:config': () => Promise<ConfigImpresion & { impresoras: string[] }>;
  'impresion:guardarConfig': (c: ConfigImpresion) => Promise<void>;
  'impresion:prueba': () => Promise<void>;
  'impresion:trabajos': () => Promise<{ conError: TrabajoImpresion[]; recientes: TrabajoImpresion[] }>;
  'impresion:reimprimir': (a: { pedidoId: string }) => Promise<void>;
  'impresion:cuenta': (a: { sesionId: string } | { pedidoId: string }) => Promise<void>;
  'impresion:reintentar': (a: { id: string }) => Promise<void>;
  'impresion:descartar': (a: { id: string }) => Promise<void>;
  'caja:leer': () => Promise<EstadoCaja & { porCobrar: Pedido[] }>;
  'caja:abrir': (a: { fondo: number }) => Promise<void>;
  'caja:movimiento': (a: { tipo: TipoMovimiento; categoria: CategoriaMovimiento; monto: number; motivo: string }) => Promise<void>;
  'caja:cerrar': (a: { contado: number; notas?: string }) => Promise<{ esperado: number; diferencia: number }>;
  'caja:cobrar': (a: {
    destino: { sesionId: string } | { pedidoId: string };
    descuento?: { tipo: 'monto' | 'porcentaje'; valor: number; motivo: string } | null;
    pagos: PagoNuevo[];
  }) => Promise<{ cobroId: string; total: number }>;
  'salon:anularItem': (a: { itemId: string; motivo: string; autorizacion?: Autorizacion }) => Promise<void>;
  'salon:anularPedido': (a: { pedidoId: string; motivo: string; autorizacion?: Autorizacion }) => Promise<void>;
  'sesion:autorizantes': () => Promise<UsuarioPublico[]>;
};

/** Usuario y PIN de quien autoriza (encargado o dueño). */
export type Autorizacion = { usuarioId: string; pin: string };

/** Dato del evento `impresion:vista` (modo vista previa). */
export type VistaImpresion = { documento: Documento; columnas: number };

/** Lo que elige la moza; precios y nombres los calcula main con la carta local. */
export type ItemPedido = { productoId: string; seleccion: Seleccion; nota: string; cantidad: number };

export type CanalServicio = keyof ServiciosGula;
export type EventoGula = 'sync:estado' | 'carta:cambio' | 'sesion:cambio' | 'salon:cambio' | 'impresion:cambio' | 'impresion:vista' | 'caja:cambio';

export const CANALES: CanalServicio[] = [
  'sesion:estado',
  'sesion:login',
  'sesion:usuarios',
  'sesion:elegirUsuario',
  'sesion:bloquear',
  'sesion:cerrar',
  'sesion:actividad',
  'carta:leer',
  'carta:editar',
  'carta:disponibilidad',
  'carta:subirFoto',
  'sync:estado',
  'salon:leer',
  'salon:mesa',
  'salon:abrirMesa',
  'salon:cerrarMesa',
  'salon:crearPedido',
  'salon:confirmar',
  'salon:rechazar',
  'salon:atenderAviso',
  'impresion:config',
  'impresion:guardarConfig',
  'impresion:prueba',
  'impresion:trabajos',
  'impresion:reimprimir',
  'impresion:cuenta',
  'impresion:reintentar',
  'impresion:descartar',
  'caja:leer',
  'caja:abrir',
  'caja:movimiento',
  'caja:cerrar',
  'caja:cobrar',
  'salon:anularItem',
  'salon:anularPedido',
  'sesion:autorizantes',
];

/** API expuesta en window.gula por el preload. */
export type PuenteGula = {
  invocar<C extends CanalServicio>(canal: C, ...args: Parameters<ServiciosGula[C]>): Promise<Sobre<Awaited<ReturnType<ServiciosGula[C]>>>>;
  escuchar(evento: EventoGula, fn: (dato: unknown) => void): () => void;
};
