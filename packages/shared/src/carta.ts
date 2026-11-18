export type OpcionPublica = { id: string; nombre: string; recargo: number; disponible: boolean };
export type GrupoPublico = {
  id: string;
  nombre: string;
  min: number;
  max: number;
  opciones: OpcionPublica[];
};
export type ProductoPublico = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto: { chica: string; grande: string } | null;
  disponible: boolean;
  etiquetas: string[];
  grupos: GrupoPublico[];
};
export type CategoriaPublica = {
  id: string;
  nombre: string;
  enHorario: boolean;
  horario: { desde: string; hasta: string } | null;
  productos: ProductoPublico[];
};
export type CartaPublica = {
  local: { nombre: string; slug: string; marca: Record<string, unknown> };
  categorias: CategoriaPublica[];
};

/** grupoId → ids de opciones elegidas. */
export type Seleccion = Record<string, string[]>;

export type ResultadoValidacion = { ok: true } | { ok: false; errores: string[] };

export function validarSeleccion(producto: ProductoPublico, sel: Seleccion): ResultadoValidacion {
  const errores: string[] = [];
  const grupos = new Map(producto.grupos.map((g) => [g.id, g]));

  for (const grupoId of Object.keys(sel)) {
    if (!grupos.has(grupoId)) errores.push('La selección incluye opciones que ya no existen');
  }
  for (const g of producto.grupos) {
    const elegidas = sel[g.id] ?? [];
    if (new Set(elegidas).size !== elegidas.length) {
      errores.push(`No podés repetir opciones en "${g.nombre}"`);
      continue;
    }
    if (elegidas.length < g.min) {
      errores.push(g.min === 1 ? `Elegí una opción en "${g.nombre}"` : `Elegí al menos ${g.min} en "${g.nombre}"`);
    }
    if (elegidas.length > g.max) errores.push(`Podés elegir hasta ${g.max} en "${g.nombre}"`);
    for (const id of elegidas) {
      const o = g.opciones.find((x) => x.id === id);
      if (!o) errores.push('La selección incluye opciones que ya no existen');
      else if (!o.disponible) errores.push(`"${o.nombre}" no está disponible`);
    }
  }
  return errores.length ? { ok: false, errores: [...new Set(errores)] } : { ok: true };
}

/** Precio base + recargos de las opciones elegidas (asume selección válida). */
export function precioUnitario(producto: ProductoPublico, sel: Seleccion): number {
  let total = producto.precio;
  for (const g of producto.grupos) {
    for (const id of sel[g.id] ?? []) total += g.opciones.find((o) => o.id === id)?.recargo ?? 0;
  }
  return total;
}
