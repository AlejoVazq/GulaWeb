import { nuevoId } from '@gula/shared';
import type { Documento, EstadoImpresion, TipoImpresion, TrabajoImpresion } from '../../compartido/impresion';
import type { BaseLocal } from './base';

type Fila = {
  id: string;
  tipo: TipoImpresion;
  pedido_id: string | null;
  sector_id: string | null;
  titulo: string;
  documento: string;
  estado: EstadoImpresion;
  error: string | null;
  intentos: number;
  creada_en: string;
  impresa_en: string | null;
};

const aTrabajo = (f: Fila): TrabajoImpresion => ({
  id: f.id,
  tipo: f.tipo,
  pedidoId: f.pedido_id,
  titulo: f.titulo,
  estado: f.estado,
  error: f.error,
  creadaEn: f.creada_en,
  impresaEn: f.impresa_en,
});

export type NuevaImpresion = { tipo: TipoImpresion; pedidoId?: string | null; sectorId?: string | null; documento: Documento };

export function insertarImpresiones(base: BaseLocal, lista: NuevaImpresion[], ahora: Date): void {
  const ins = base.db.prepare(
    `INSERT INTO impresiones (id, tipo, pedido_id, sector_id, titulo, documento, estado, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
  );
  base.transaccion(() => {
    for (const t of lista)
      ins.run(nuevoId(), t.tipo, t.pedidoId ?? null, t.sectorId ?? null, t.documento.titulo, JSON.stringify(t.documento), ahora.toISOString());
  });
}

/** El próximo a imprimir, en orden de creación (el id UUIDv7 ordena por tiempo). */
export function siguientePendiente(base: BaseLocal): { id: string; documento: Documento } | null {
  const f = base.db.prepare("SELECT id, documento FROM impresiones WHERE estado = 'pendiente' ORDER BY id LIMIT 1").get() as
    | { id: string; documento: string }
    | undefined;
  return f ? { id: f.id, documento: JSON.parse(f.documento) as Documento } : null;
}

export function marcarImpresion(
  base: BaseLocal,
  id: string,
  estado: EstadoImpresion,
  extra: { error?: string | null; impresaEn?: string } = {},
): void {
  base.db
    .prepare(
      `UPDATE impresiones SET estado = ?, error = ?, impresa_en = coalesce(?, impresa_en),
         intentos = intentos + (CASE WHEN ? = 'imprimiendo' THEN 1 ELSE 0 END) WHERE id = ?`,
    )
    .run(estado, extra.error ?? null, extra.impresaEn ?? null, estado, id);
}

/** Vuelve a la cola un trabajo con error. */
export function reencolarImpresion(base: BaseLocal, id: string): boolean {
  return base.db.prepare("UPDATE impresiones SET estado = 'pendiente', error = NULL WHERE id = ? AND estado = 'error'").run(id).changes > 0;
}

/** Tras un cierre inesperado: lo que estaba saliendo pudo haber salido o no. */
export function marcarInterrumpidas(base: BaseLocal, mensaje: string): number {
  return Number(
    base.db.prepare("UPDATE impresiones SET estado = 'error', error = ? WHERE estado = 'imprimiendo'").run(mensaje).changes,
  );
}

export function leerTrabajos(base: BaseLocal): { conError: TrabajoImpresion[]; recientes: TrabajoImpresion[] } {
  const conError = base.db.prepare("SELECT * FROM impresiones WHERE estado = 'error' ORDER BY id").all() as Fila[];
  const recientes = base.db.prepare('SELECT * FROM impresiones ORDER BY id DESC LIMIT 20').all() as Fila[];
  return { conError: conError.map(aTrabajo), recientes: recientes.map(aTrabajo) };
}
