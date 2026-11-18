/** Filas tal como las devuelve GET /sync/carta (camelCase, fechas ISO). */
type Base = { id: string; actualizadoEn: string; eliminadoEn: string | null };
export type FilaSector = Base & { nombre: string; orden: number };
export type FilaCategoria = Base & {
  nombre: string;
  orden: number;
  visible: boolean;
  horarioDesde: string | null;
  horarioHasta: string | null;
};
export type Foto = { chica: string; grande: string } | null;
export type FilaProducto = Base & {
  categoriaId: string;
  sectorId: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto: Foto;
  disponible: boolean;
  visible: boolean;
  orden: number;
  etiquetas: string[];
};
export type FilaGrupo = Base & { productoId: string; nombre: string; min: number; max: number; orden: number };
export type FilaOpcion = Base & {
  grupoId: string;
  nombre: string;
  recargo: number;
  disponible: boolean;
  orden: number;
};

export type RespuestaPullCarta = {
  cursor: string;
  sectores: FilaSector[];
  categorias: FilaCategoria[];
  productos: FilaProducto[];
  grupos: FilaGrupo[];
  opciones: FilaOpcion[];
};

type SinMeta<T> = Omit<T, 'actualizadoEn' | 'eliminadoEn'>;
export type OpcionLocal = SinMeta<FilaOpcion>;
export type GrupoLocal = SinMeta<FilaGrupo> & { opciones: OpcionLocal[] };
export type ProductoLocal = SinMeta<FilaProducto> & { grupos: GrupoLocal[] };
export type CategoriaLocal = SinMeta<FilaCategoria> & { productos: ProductoLocal[] };
export type CartaLocal = { sectores: SinMeta<FilaSector>[]; categorias: CategoriaLocal[] };

export type Operacion = {
  id: string;
  tipo: string;
  datos: unknown;
  creadaEn: string;
  intentos: number;
  ultimoError: string | null;
  estado: 'pendiente' | 'rechazada';
};
