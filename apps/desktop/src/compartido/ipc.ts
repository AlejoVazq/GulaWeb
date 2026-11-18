import type { UsuarioPublico } from './usuarios';
import type { CartaLocal } from './tipos';

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
};

export type CanalServicio = keyof ServiciosGula;
export type EventoGula = 'sync:estado' | 'carta:cambio' | 'sesion:cambio';

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
];

/** API expuesta en window.gula por el preload. */
export type PuenteGula = {
  invocar<C extends CanalServicio>(canal: C, ...args: Parameters<ServiciosGula[C]>): Promise<Sobre<Awaited<ReturnType<ServiciosGula[C]>>>>;
  escuchar(evento: EventoGula, fn: (dato: unknown) => void): () => void;
};
