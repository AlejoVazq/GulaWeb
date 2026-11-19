import { resumenTurno, type CategoriaMovimiento, type MetodoPago, type TipoMovimiento } from '@gula/shared';
import type { Cobro, EstadoCaja, Movimiento, Pago, RespuestaPullCaja, Turno } from '../../compartido/caja';
import type { Pedido } from '../../compartido/salon';
import type { BaseLocal } from './base';
import { upsert } from './carta';
import { cerrarMesaLocal, conItems, type F } from './salon';

/** Las filas creadas en la PC pierden contra cualquier versión del servidor. */
const LOCAL = '';
type Quien = { usuarioId: string; ahora: Date };

/** Turnos y cobros con una operación de caja todavía en la outbox: el pull no los pisa. */
function protegidos(base: BaseLocal) {
  const ops = base.db
    .prepare("SELECT datos FROM outbox WHERE estado = 'pendiente' AND (tipo LIKE 'caja.%' OR tipo = 'cuenta.cobrar')")
    .all() as { datos: string }[];
  const turnos = new Set<string>();
  const cobros = new Set<string>();
  for (const o of ops) {
    const d = JSON.parse(o.datos) as { turnoId?: string; cobroId?: string };
    if (d.turnoId) turnos.add(d.turnoId);
    if (d.cobroId) cobros.add(d.cobroId);
  }
  return { turnos, cobros };
}

/** Devuelve cuántas filas se salteó por tener cambios locales en vuelo (si hubo, no se avanza el cursor). */
export function aplicarCambiosCaja(base: BaseLocal, c: RespuestaPullCaja): number {
  const tur = upsert(base, 'turnos', [
    'abierto_por', 'abierto_en', 'fondo', 'cerrado_por', 'cerrado_en', 'contado', 'esperado', 'diferencia', 'notas',
  ]);
  const cob = upsert(base, 'cobros', [
    'turno_id', 'sesion_id', 'pedido_id', 'subtotal', 'descuento', 'motivo_descuento', 'total', 'cobrado_por', 'cobrado_en',
  ]);
  const pag = upsert(base, 'pagos', ['cobro_id', 'turno_id', 'metodo', 'monto', 'propina']);
  const mov = upsert(base, 'movimientos', ['turno_id', 'tipo', 'categoria', 'monto', 'motivo', 'usuario_id', 'hecho_en']);
  return base.transaccion(() => {
    const p = protegidos(base);
    const turnos = c.turnos.filter((t) => !p.turnos.has(t.id));
    const salteadas = c.turnos.length - turnos.length;
    for (const t of turnos)
      tur.run(
        t.id, t.abiertoPor, t.abiertoEn, t.fondo, t.cerradoPor, t.cerradoEn, t.contado, t.esperado, t.diferencia, t.notas,
        t.actualizadoEn, t.eliminadoEn,
      );
    for (const x of c.cobros)
      cob.run(
        x.id, x.turnoId, x.sesionId, x.pedidoId, x.subtotal, x.descuento, x.motivoDescuento, x.total, x.cobradoPor, x.cobradoEn,
        x.actualizadoEn, x.eliminadoEn,
      );
    for (const x of c.pagos) pag.run(x.id, x.cobroId, x.turnoId, x.metodo, x.monto, x.propina, x.actualizadoEn, x.eliminadoEn);
    for (const x of c.movimientos)
      mov.run(x.id, x.turnoId, x.tipo, x.categoria, x.monto, x.motivo, x.usuarioId, x.hechoEn, x.actualizadoEn, x.eliminadoEn);
    return salteadas;
  });
}

const num = (v: unknown) => (v as number | null) ?? null;
const txt = (v: unknown) => (v as string | null) ?? null;
const aTurno = (t: F): Turno => ({
  id: t.id as string,
  abiertoPor: t.abierto_por as string,
  abiertoEn: t.abierto_en as string,
  fondo: t.fondo as number,
  cerradoPor: txt(t.cerrado_por),
  cerradoEn: txt(t.cerrado_en),
  contado: num(t.contado),
  esperado: num(t.esperado),
  diferencia: num(t.diferencia),
  notas: txt(t.notas),
});
const aPago = (p: F): Pago => ({
  id: p.id as string,
  cobroId: p.cobro_id as string,
  turnoId: p.turno_id as string,
  metodo: p.metodo as MetodoPago,
  monto: p.monto as number,
  propina: p.propina as number,
});
const aMovimiento = (m: F): Movimiento => ({
  id: m.id as string,
  turnoId: m.turno_id as string,
  tipo: m.tipo as TipoMovimiento,
  categoria: m.categoria as CategoriaMovimiento,
  monto: m.monto as number,
  motivo: m.motivo as string,
  usuarioId: m.usuario_id as string,
  hechoEn: m.hecho_en as string,
});

export function turnoAbiertoLocal(base: BaseLocal): Turno | null {
  const f = base.db
    .prepare('SELECT * FROM turnos WHERE cerrado_en IS NULL AND eliminado_en IS NULL ORDER BY abierto_en DESC LIMIT 1')
    .get() as F | undefined;
  return f ? aTurno(f) : null;
}

export function leerCaja(base: BaseLocal): EstadoCaja {
  const turno = turnoAbiertoLocal(base);
  const u = base.db
    .prepare('SELECT * FROM turnos WHERE cerrado_en IS NOT NULL AND eliminado_en IS NULL ORDER BY cerrado_en DESC LIMIT 1')
    .get() as F | undefined;
  const ultimoCierre = u ? aTurno(u) : null;
  if (!turno) return { turno: null, resumen: null, movimientos: [], cobros: [], ultimoCierre };
  const pagos = (base.db.prepare('SELECT * FROM pagos WHERE turno_id = ? AND eliminado_en IS NULL ORDER BY id').all(turno.id) as F[]).map(aPago);
  const movimientos = (
    base.db.prepare('SELECT * FROM movimientos WHERE turno_id = ? AND eliminado_en IS NULL ORDER BY hecho_en').all(turno.id) as F[]
  ).map(aMovimiento);
  const cobros = (
    base.db
      .prepare(
        `SELECT c.*, m.nombre AS mesa, p.numero AS numero FROM cobros c
         LEFT JOIN sesiones s ON s.id = c.sesion_id LEFT JOIN mesas m ON m.id = s.mesa_id
         LEFT JOIN pedidos p ON p.id = c.pedido_id
         WHERE c.turno_id = ? AND c.eliminado_en IS NULL ORDER BY c.cobrado_en`,
      )
      .all(turno.id) as F[]
  ).map(
    (c): Cobro => ({
      id: c.id as string,
      turnoId: c.turno_id as string,
      sesionId: txt(c.sesion_id),
      pedidoId: txt(c.pedido_id),
      subtotal: c.subtotal as number,
      descuento: c.descuento as number,
      motivoDescuento: txt(c.motivo_descuento),
      total: c.total as number,
      cobradoPor: c.cobrado_por as string,
      cobradoEn: c.cobrado_en as string,
      pagos: pagos.filter((p) => p.cobroId === c.id),
      destino: c.sesion_id ? ((c.mesa as string | null) ?? 'Mesa') : `Mostrador · Pedido ${(c.numero as number | null) ?? '-'}`,
    }),
  );
  return { turno, resumen: resumenTurno({ fondo: turno.fondo, pagos, movimientos }), movimientos, cobros, ultimoCierre };
}

/** Pedidos de mostrador confirmados que todavía no se cobraron. */
export function porCobrarMostrador(base: BaseLocal): Pedido[] {
  return conItems(
    base,
    base.db
      .prepare("SELECT * FROM pedidos WHERE origen = 'mostrador' AND estado = 'confirmado' AND eliminado_en IS NULL ORDER BY creado_en")
      .all() as F[],
  );
}

export function abrirCajaLocal(base: BaseLocal, d: Quien & { turnoId: string; fondo: number }) {
  base.db
    .prepare('INSERT INTO turnos (id, abierto_por, abierto_en, fondo, actualizado_en) VALUES (?, ?, ?, ?, ?)')
    .run(d.turnoId, d.usuarioId, d.ahora.toISOString(), d.fondo, LOCAL);
}

export function movimientoLocal(
  base: BaseLocal,
  d: Quien & { movimientoId: string; turnoId: string; tipo: TipoMovimiento; categoria: CategoriaMovimiento; monto: number; motivo: string },
) {
  base.db
    .prepare(
      `INSERT INTO movimientos (id, turno_id, tipo, categoria, monto, motivo, usuario_id, hecho_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.movimientoId, d.turnoId, d.tipo, d.categoria, d.monto, d.motivo, d.usuarioId, d.ahora.toISOString(), LOCAL);
}

export function cerrarCajaLocal(base: BaseLocal, d: Quien & { turnoId: string; contado: number; esperado: number; notas: string | null }) {
  base.db
    .prepare('UPDATE turnos SET cerrado_por = ?, cerrado_en = ?, contado = ?, esperado = ?, diferencia = ?, notas = ? WHERE id = ?')
    .run(d.usuarioId, d.ahora.toISOString(), d.contado, d.esperado, d.contado - d.esperado, d.notas, d.turnoId);
}

export function cobrarLocal(
  base: BaseLocal,
  d: Quien & {
    cobroId: string;
    turnoId: string;
    sesionId: string | null;
    pedidoId: string | null;
    subtotal: number;
    descuento: number;
    motivoDescuento: string | null;
    pagos: { pagoId: string; metodo: MetodoPago; monto: number; propina: number }[];
  },
) {
  const t = d.ahora.toISOString();
  base.transaccion(() => {
    base.db
      .prepare(
        `INSERT INTO cobros (id, turno_id, sesion_id, pedido_id, subtotal, descuento, motivo_descuento, total, cobrado_por,
           cobrado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.cobroId, d.turnoId, d.sesionId, d.pedidoId, d.subtotal, d.descuento, d.motivoDescuento, d.subtotal - d.descuento, d.usuarioId, t, LOCAL);
    const ins = base.db.prepare(
      'INSERT INTO pagos (id, cobro_id, turno_id, metodo, monto, propina, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const p of d.pagos) ins.run(p.pagoId, d.cobroId, d.turnoId, p.metodo, p.monto, p.propina, LOCAL);
    if (d.sesionId) {
      base.db.prepare("UPDATE pedidos SET estado = 'cobrado' WHERE sesion_id = ? AND estado = 'confirmado'").run(d.sesionId);
      cerrarMesaLocal(base, { sesionId: d.sesionId, usuarioId: d.usuarioId, ahora: d.ahora });
    } else {
      base.db.prepare("UPDATE pedidos SET estado = 'cobrado' WHERE id = ? AND estado = 'confirmado'").run(d.pedidoId);
    }
  });
}

export function anularItemLocal(base: BaseLocal, d: Quien & { itemId: string; pedidoId: string; motivo: string }) {
  const t = d.ahora.toISOString();
  base.transaccion(() => {
    base.db
      .prepare('UPDATE items SET anulado = 1, anulado_por = ?, motivo_anulacion = ?, anulado_en = ? WHERE id = ? AND pedido_id = ?')
      .run(d.usuarioId, d.motivo, t, d.itemId, d.pedidoId);
    const { vivos } = base.db
      .prepare('SELECT count(*) AS vivos FROM items WHERE pedido_id = ? AND anulado = 0 AND eliminado_en IS NULL')
      .get(d.pedidoId) as { vivos: number };
    if (!vivos) anularPedidoLocal(base, d);
  });
}

export function anularPedidoLocal(base: BaseLocal, d: Quien & { pedidoId: string; motivo: string }) {
  base.db
    .prepare("UPDATE pedidos SET estado = 'anulado', anulado_por = ?, motivo_anulacion = ?, anulado_en = ? WHERE id = ?")
    .run(d.usuarioId, d.motivo, d.ahora.toISOString(), d.pedidoId);
}

/** El servidor rechazó una operación de caja: se borra lo que la PC creó por su cuenta (el pull revierte el resto). */
export function revertirOperacionCaja(base: BaseLocal, tipo: string, datos: unknown): void {
  const d = (datos ?? {}) as { turnoId?: string; movimientoId?: string; cobroId?: string };
  base.transaccion(() => {
    if (tipo === 'caja.abrir' && d.turnoId) base.db.prepare('DELETE FROM turnos WHERE id = ? AND actualizado_en = ?').run(d.turnoId, LOCAL);
    if (tipo === 'caja.movimiento' && d.movimientoId)
      base.db.prepare('DELETE FROM movimientos WHERE id = ? AND actualizado_en = ?').run(d.movimientoId, LOCAL);
    if (tipo === 'cuenta.cobrar' && d.cobroId) {
      base.db.prepare('DELETE FROM pagos WHERE cobro_id = ? AND actualizado_en = ?').run(d.cobroId, LOCAL);
      base.db.prepare('DELETE FROM cobros WHERE id = ? AND actualizado_en = ?').run(d.cobroId, LOCAL);
    }
  });
}

export function vaciarCajaLocal(base: BaseLocal): void {
  base.transaccion(() => base.db.exec('DELETE FROM pagos; DELETE FROM cobros; DELETE FROM movimientos; DELETE FROM turnos;'));
}
