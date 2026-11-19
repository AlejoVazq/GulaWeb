import type {
  CartaLocal,
  CategoriaLocal,
  FilaCategoria,
  FilaGrupo,
  FilaOpcion,
  FilaProducto,
  FilaSector,
  GrupoLocal,
  OpcionLocal,
  ProductoLocal,
  RespuestaPullCarta,
} from '../../compartido/tipos';
import type { BaseLocal } from './base';

const b = (v: boolean) => (v ? 1 : 0);

/** INSERT … ON CONFLICT que solo actualiza si lo entrante es igual o más nuevo. */
export function upsert(base: BaseLocal, tabla: string, columnas: string[]) {
  const lista = ['id', ...columnas, 'actualizado_en', 'eliminado_en'];
  const sets = lista.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  return base.db.prepare(
    `INSERT INTO ${tabla} (${lista.join(', ')}) VALUES (${lista.map(() => '?').join(', ')})
     ON CONFLICT(id) DO UPDATE SET ${sets} WHERE excluded.actualizado_en >= ${tabla}.actualizado_en`,
  );
}

export function aplicarCambiosCarta(base: BaseLocal, c: RespuestaPullCarta): void {
  const sec = upsert(base, 'sectores', ['nombre', 'orden']);
  const cat = upsert(base, 'categorias', ['nombre', 'orden', 'visible', 'horario_desde', 'horario_hasta']);
  const pro = upsert(base, 'productos', [
    'categoria_id', 'sector_id', 'nombre', 'descripcion', 'precio', 'foto', 'disponible', 'visible', 'orden', 'etiquetas',
  ]);
  const gru = upsert(base, 'grupos', ['producto_id', 'nombre', 'min', 'max', 'orden']);
  const opc = upsert(base, 'opciones', ['grupo_id', 'nombre', 'recargo', 'disponible', 'orden']);
  base.transaccion(() => {
    for (const s of c.sectores) sec.run(s.id, s.nombre, s.orden, s.actualizadoEn, s.eliminadoEn);
    for (const x of c.categorias) {
      cat.run(x.id, x.nombre, x.orden, b(x.visible), x.horarioDesde, x.horarioHasta, x.actualizadoEn, x.eliminadoEn);
    }
    for (const p of c.productos) {
      pro.run(
        p.id, p.categoriaId, p.sectorId, p.nombre, p.descripcion, p.precio, p.foto ? JSON.stringify(p.foto) : null,
        b(p.disponible), b(p.visible), p.orden, JSON.stringify(p.etiquetas), p.actualizadoEn, p.eliminadoEn,
      );
    }
    for (const g of c.grupos) gru.run(g.id, g.productoId, g.nombre, g.min, g.max, g.orden, g.actualizadoEn, g.eliminadoEn);
    for (const o of c.opciones) {
      opc.run(o.id, o.grupoId, o.nombre, o.recargo, b(o.disponible), o.orden, o.actualizadoEn, o.eliminadoEn);
    }
  });
}

type F = Record<string, unknown>;
const vigentes = (base: BaseLocal, tabla: string) =>
  base.db.prepare(`SELECT * FROM ${tabla} WHERE eliminado_en IS NULL ORDER BY orden, nombre`).all() as F[];

export function leerCarta(base: BaseLocal): CartaLocal {
  const opciones = vigentes(base, 'opciones').map(
    (o): OpcionLocal & { _g: string } => ({
      id: o.id as string,
      grupoId: o.grupo_id as string,
      nombre: o.nombre as string,
      recargo: o.recargo as number,
      disponible: o.disponible === 1,
      orden: o.orden as number,
      _g: o.grupo_id as string,
    }),
  );
  const grupos = vigentes(base, 'grupos').map(
    (g): GrupoLocal => ({
      id: g.id as string,
      productoId: g.producto_id as string,
      nombre: g.nombre as string,
      min: g.min as number,
      max: g.max as number,
      orden: g.orden as number,
      opciones: opciones.filter((o) => o._g === g.id).map(({ _g, ...o }) => o),
    }),
  );
  const productos = vigentes(base, 'productos').map(
    (p): ProductoLocal => ({
      id: p.id as string,
      categoriaId: p.categoria_id as string,
      sectorId: (p.sector_id as string | null) ?? null,
      nombre: p.nombre as string,
      descripcion: (p.descripcion as string | null) ?? null,
      precio: p.precio as number,
      foto: p.foto ? (JSON.parse(p.foto as string) as FilaProducto['foto']) : null,
      disponible: p.disponible === 1,
      visible: p.visible === 1,
      orden: p.orden as number,
      etiquetas: JSON.parse(p.etiquetas as string) as string[],
      grupos: grupos.filter((g) => g.productoId === p.id),
    }),
  );
  const categorias = vigentes(base, 'categorias').map(
    (c): CategoriaLocal => ({
      id: c.id as string,
      nombre: c.nombre as string,
      orden: c.orden as number,
      visible: c.visible === 1,
      horarioDesde: (c.horario_desde as string | null) ?? null,
      horarioHasta: (c.horario_hasta as string | null) ?? null,
      productos: productos.filter((p) => p.categoriaId === c.id),
    }),
  );
  const sectores = vigentes(base, 'sectores').map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
    orden: s.orden as number,
  }));
  return { sectores, categorias };
}

/** Cambio optimista mientras la operación viaja por la outbox. */
export function fijarDisponibilidadLocal(
  base: BaseLocal,
  d: { productoId?: string; opcionId?: string; disponible: boolean },
): void {
  if (d.productoId) base.db.prepare('UPDATE productos SET disponible = ? WHERE id = ?').run(b(d.disponible), d.productoId);
  if (d.opcionId) base.db.prepare('UPDATE opciones SET disponible = ? WHERE id = ?').run(b(d.disponible), d.opcionId);
}

export type { FilaCategoria, FilaGrupo, FilaOpcion, FilaSector };

/** Borra la carta local (al vincular la PC a otro local). */
export function vaciarCartaLocal(base: BaseLocal): void {
  base.transaccion(() => base.db.exec('DELETE FROM opciones; DELETE FROM grupos; DELETE FROM productos; DELETE FROM categorias; DELETE FROM sectores;'));
}

export function leerSectores(base: BaseLocal): { id: string; nombre: string }[] {
  return base.db.prepare('SELECT id, nombre FROM sectores WHERE eliminado_en IS NULL ORDER BY orden, nombre').all() as {
    id: string;
    nombre: string;
  }[];
}
