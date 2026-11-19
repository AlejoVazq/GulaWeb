import type {
  Ajuste,
  Aviso,
  DetalleMesa,
  Item,
  ItemNuevo,
  Mesa,
  Pedido,
  RespuestaPullSalon,
  Salon,
  Sesion,
} from '../../compartido/salon';
import type { BaseLocal } from './base';
import { upsert } from './carta';
import { escribirKv, leerKv } from './kv';

const b = (v: boolean) => (v ? 1 : 0);
/** Las filas creadas en la PC pierden contra cualquier versión del servidor. */
const LOCAL = '';

/**
 * Filas con un cambio local que todavía viaja en la outbox: un pull (en vuelo o del solape) traería
 * la versión anterior del servidor y desharía lo que la moza acaba de hacer.
 */
function protegidas(base: BaseLocal) {
  const ops = base.db.prepare("SELECT datos FROM outbox WHERE estado = 'pendiente' AND tipo LIKE '%.%'").all() as {
    datos: string;
  }[];
  const sesiones = new Set<string>();
  const pedidos = new Set<string>();
  const avisos = new Set<string>();
  for (const o of ops) {
    const d = JSON.parse(o.datos) as { sesionId?: string; pedidoId?: string; avisoId?: string };
    if (d.sesionId) sesiones.add(d.sesionId);
    if (d.pedidoId) pedidos.add(d.pedidoId);
    if (d.avisoId) avisos.add(d.avisoId);
  }
  return {
    sesion: (id: string) => sesiones.has(id),
    pedido: (p: { id: string; sesionId: string | null }) => pedidos.has(p.id) || (!!p.sesionId && sesiones.has(p.sesionId)),
    aviso: (a: { id: string; sesionId: string }) => avisos.has(a.id) || sesiones.has(a.sesionId),
    item: (pedidoId: string) => pedidos.has(pedidoId),
  };
}

/** Devuelve cuántas filas se salteó por tener cambios locales en vuelo (si hubo, no hay que avanzar el cursor). */
export function aplicarCambiosSalon(base: BaseLocal, c: RespuestaPullSalon): number {
  const mes = upsert(base, 'mesas', ['nombre', 'zona', 'capacidad', 'orden', 'token']);
  const ses = upsert(base, 'sesiones', [
    'mesa_id', 'estado', 'comensales', 'abierta_por', 'abierta_en', 'cerrada_por', 'cerrada_en',
  ]);
  const ped = upsert(base, 'pedidos', [
    'origen', 'estado', 'sesion_id', 'mesa_id', 'numero', 'dia', 'notas', 'motivo_rechazo', 'creado_por',
    'confirmado_por', 'confirmado_en', 'rechazado_en', 'creado_en', 'anulado_por', 'motivo_anulacion', 'anulado_en',
  ]);
  const ite = upsert(base, 'items', [
    'pedido_id', 'producto_id', 'nombre', 'precio_unitario', 'cantidad', 'seleccion', 'resumen_opciones', 'nota',
    'sector_id', 'anulado', 'creado_en', 'anulado_por', 'motivo_anulacion', 'anulado_en',
  ]);
  const avi = upsert(base, 'avisos', ['sesion_id', 'tipo', 'atendido_por', 'atendido_en', 'creado_en']);
  return base.transaccion(() => {
    const prot = protegidas(base);
    const total = c.sesiones.length + c.pedidos.length + c.items.length + c.avisos.length;
    // Ojo: un pedido protegido por su sesión no protege sus ítems (no cambian al cerrar la mesa).
    c = {
      ...c,
      sesiones: c.sesiones.filter((s) => !prot.sesion(s.id)),
      pedidos: c.pedidos.filter((p) => !prot.pedido(p)),
      items: c.items.filter((i) => !prot.item(i.pedidoId)),
      avisos: c.avisos.filter((a) => !prot.aviso(a)),
    };
    const salteadas = total - (c.sesiones.length + c.pedidos.length + c.items.length + c.avisos.length);
    for (const m of c.mesas) mes.run(m.id, m.nombre, m.zona, m.capacidad, m.orden, m.token, m.actualizadoEn, m.eliminadoEn);
    for (const s of c.sesiones) {
      ses.run(
        s.id, s.mesaId, s.estado, s.comensales, s.abiertaPor, s.abiertaEn, s.cerradaPor, s.cerradaEn,
        s.actualizadoEn, s.eliminadoEn,
      );
    }
    for (const p of c.pedidos) {
      ped.run(
        p.id, p.origen, p.estado, p.sesionId, p.mesaId, p.numero, p.dia, p.notas, p.motivoRechazo, p.creadoPor,
        p.confirmadoPor, p.confirmadoEn, p.rechazadoEn, p.creadoEn, p.anuladoPor ?? null, p.motivoAnulacion ?? null,
        p.anuladoEn ?? null, p.actualizadoEn, p.eliminadoEn,
      );
    }
    for (const i of c.items) {
      ite.run(
        i.id, i.pedidoId, i.productoId, i.nombre, i.precioUnitario, i.cantidad, JSON.stringify(i.seleccion),
        i.resumenOpciones, i.nota, i.sectorId, b(i.anulado), i.creadoEn, i.anuladoPor ?? null, i.motivoAnulacion ?? null,
        i.anuladoEn ?? null, i.actualizadoEn, i.eliminadoEn,
      );
    }
    for (const a of c.avisos) {
      avi.run(a.id, a.sesionId, a.tipo, a.atendidoPor, a.atendidoEn, a.creadoEn, a.actualizadoEn, a.eliminadoEn);
    }
    return salteadas;
  });
}

export type F = Record<string, unknown>;
const txt = (v: unknown) => (v as string | null) ?? null;
const num = (v: unknown) => (v as number | null) ?? null;

const aMesa = (m: F): Mesa => ({
  id: m.id as string,
  nombre: m.nombre as string,
  zona: txt(m.zona),
  capacidad: num(m.capacidad),
  orden: m.orden as number,
  token: m.token as string,
});
const aSesion = (s: F): Sesion => ({
  id: s.id as string,
  mesaId: s.mesa_id as string,
  estado: s.estado as Sesion['estado'],
  comensales: num(s.comensales),
  abiertaPor: txt(s.abierta_por),
  abiertaEn: s.abierta_en as string,
  cerradaPor: txt(s.cerrada_por),
  cerradaEn: txt(s.cerrada_en),
});
const aItem = (i: F): Item => ({
  id: i.id as string,
  pedidoId: i.pedido_id as string,
  productoId: i.producto_id as string,
  nombre: i.nombre as string,
  precioUnitario: i.precio_unitario as number,
  cantidad: i.cantidad as number,
  seleccion: JSON.parse(i.seleccion as string) as Item['seleccion'],
  resumenOpciones: i.resumen_opciones as string,
  nota: i.nota as string,
  sectorId: txt(i.sector_id),
  anulado: i.anulado === 1,
  creadoEn: i.creado_en as string,
});
const aAviso = (a: F): Aviso => ({
  id: a.id as string,
  sesionId: a.sesion_id as string,
  tipo: a.tipo as Aviso['tipo'],
  atendidoPor: txt(a.atendido_por),
  atendidoEn: txt(a.atendido_en),
  creadoEn: a.creado_en as string,
});

export function conItems(base: BaseLocal, filas: F[]): Pedido[] {
  if (!filas.length) return [];
  const ids = filas.map((p) => p.id as string);
  const items = (
    base.db
      .prepare(
        `SELECT * FROM items WHERE pedido_id IN (${ids.map(() => '?').join(',')})
         AND anulado = 0 AND eliminado_en IS NULL ORDER BY creado_en, id`,
      )
      .all(...ids) as F[]
  ).map(aItem);
  return filas.map((p) => {
    const propios = items.filter((i) => i.pedidoId === p.id);
    return {
      id: p.id as string,
      origen: p.origen as Pedido['origen'],
      estado: p.estado as Pedido['estado'],
      sesionId: txt(p.sesion_id),
      mesaId: txt(p.mesa_id),
      numero: num(p.numero),
      dia: txt(p.dia),
      notas: txt(p.notas),
      motivoRechazo: txt(p.motivo_rechazo),
      creadoPor: txt(p.creado_por),
      confirmadoPor: txt(p.confirmado_por),
      confirmadoEn: txt(p.confirmado_en),
      rechazadoEn: txt(p.rechazado_en),
      anuladoPor: txt(p.anulado_por),
      motivoAnulacion: txt(p.motivo_anulacion),
      anuladoEn: txt(p.anulado_en),
      creadoEn: p.creado_en as string,
      items: propios,
      total: propios.reduce((t, i) => t + i.precioUnitario * i.cantidad, 0),
    };
  });
}

const sesionesAbiertas = (base: BaseLocal) =>
  (base.db.prepare("SELECT * FROM sesiones WHERE estado <> 'cerrada' AND eliminado_en IS NULL").all() as F[]).map(
    aSesion,
  );

export function leerSalon(base: BaseLocal): Salon {
  const mesas = (
    base.db.prepare('SELECT * FROM mesas WHERE eliminado_en IS NULL ORDER BY orden, nombre').all() as F[]
  ).map(aMesa);
  const sesiones = sesionesAbiertas(base);
  const avisos = (
    base.db.prepare('SELECT * FROM avisos WHERE atendido_en IS NULL AND eliminado_en IS NULL ORDER BY creado_en').all() as F[]
  ).map(aAviso);
  const pendientes = conItems(
    base,
    base.db.prepare("SELECT * FROM pedidos WHERE estado = 'pendiente' AND eliminado_en IS NULL ORDER BY creado_en").all() as F[],
  );
  const porSesion = new Map(sesiones.map((s) => [s.id, s]));
  const nombreMesa = new Map(mesas.map((m) => [m.id, m.nombre]));
  const avisosVivos = avisos.filter((a) => porSesion.has(a.sesionId));

  return {
    mesas: mesas.map((m) => {
      const sesion = sesiones.find((s) => s.mesaId === m.id) ?? null;
      return {
        ...m,
        sesion,
        pendientes: sesion ? pendientes.filter((p) => p.sesionId === sesion.id).length : 0,
        avisos: sesion ? avisosVivos.filter((a) => a.sesionId === sesion.id) : [],
      };
    }),
    pendientes: pendientes.map((p) => ({
      ...p,
      mesa: p.mesaId && nombreMesa.has(p.mesaId) ? { id: p.mesaId, nombre: nombreMesa.get(p.mesaId)! } : null,
    })),
    avisos: avisosVivos.map((a) => {
      const mesaId = porSesion.get(a.sesionId)!.mesaId;
      return { ...a, mesa: { id: mesaId, nombre: nombreMesa.get(mesaId) ?? '' } };
    }),
  };
}

export function leerMesa(base: BaseLocal, mesaId: string): DetalleMesa | null {
  const m = base.db.prepare('SELECT * FROM mesas WHERE id = ? AND eliminado_en IS NULL').get(mesaId) as F | undefined;
  if (!m) return null;
  const sesion = sesionesAbiertas(base).find((s) => s.mesaId === mesaId) ?? null;
  if (!sesion) return { mesa: aMesa(m), sesion: null, pedidos: [], avisos: [] };
  const pedidos = conItems(
    base,
    base.db.prepare('SELECT * FROM pedidos WHERE sesion_id = ? AND eliminado_en IS NULL ORDER BY creado_en').all(sesion.id) as F[],
  );
  const avisos = (
    base.db
      .prepare('SELECT * FROM avisos WHERE sesion_id = ? AND atendido_en IS NULL AND eliminado_en IS NULL ORDER BY creado_en')
      .all(sesion.id) as F[]
  ).map(aAviso);
  return { mesa: aMesa(m), sesion, pedidos, avisos };
}

/** Un pedido con sus ítems vigentes y el nombre de su mesa (para imprimirlo). */
export function leerPedido(base: BaseLocal, pedidoId: string): (Pedido & { mesa: { id: string; nombre: string } | null }) | null {
  const f = base.db.prepare('SELECT * FROM pedidos WHERE id = ? AND eliminado_en IS NULL').get(pedidoId) as F | undefined;
  if (!f) return null;
  const [p] = conItems(base, [f]);
  const m = p!.mesaId
    ? (base.db.prepare('SELECT id, nombre FROM mesas WHERE id = ?').get(p!.mesaId) as { id: string; nombre: string } | undefined)
    : undefined;
  return { ...p!, mesa: m ? { id: m.id, nombre: m.nombre } : null };
}

/** Correlativo del día; nunca repite un número que ya esté en la base (aunque se haya perdido el contador). */
export function siguienteNumero(base: BaseLocal, dia: string): number {
  return base.transaccion(() => {
    const clave = `numero:${dia}`;
    const contador = Number(leerKv(base, clave) ?? 0);
    const { maximo } = base.db.prepare('SELECT coalesce(max(numero), 0) AS maximo FROM pedidos WHERE dia = ?').get(dia) as {
      maximo: number;
    };
    const n = Math.max(contador, maximo) + 1;
    escribirKv(base, clave, String(n));
    return n;
  });
}

type Quien = { usuarioId: string; ahora: Date };

export function abrirMesaLocal(base: BaseLocal, d: Quien & { sesionId: string; mesaId: string; comensales: number | null }) {
  base.db
    .prepare(
      `INSERT INTO sesiones (id, mesa_id, estado, comensales, abierta_por, abierta_en, actualizado_en)
       VALUES (?, ?, 'abierta', ?, ?, ?, ?)`,
    )
    .run(d.sesionId, d.mesaId, d.comensales, d.usuarioId, d.ahora.toISOString(), LOCAL);
}

export function cerrarMesaLocal(base: BaseLocal, d: Quien & { sesionId: string }) {
  const t = d.ahora.toISOString();
  base.transaccion(() => {
    base.db
      .prepare(
        "UPDATE pedidos SET estado = 'rechazado', motivo_rechazo = 'La mesa se cerró', rechazado_en = ? WHERE sesion_id = ? AND estado = 'pendiente'",
      )
      .run(t, d.sesionId);
    base.db
      .prepare('UPDATE avisos SET atendido_en = ?, atendido_por = ? WHERE sesion_id = ? AND atendido_en IS NULL')
      .run(t, d.usuarioId, d.sesionId);
    base.db
      .prepare("UPDATE sesiones SET estado = 'cerrada', cerrada_en = ?, cerrada_por = ? WHERE id = ?")
      .run(t, d.usuarioId, d.sesionId);
  });
}

export function crearPedidoLocal(
  base: BaseLocal,
  d: Quien & {
    pedidoId: string;
    origen: 'manual' | 'mostrador';
    sesionId: string | null;
    numero: number;
    dia: string;
    notas: string | null;
    items: ItemNuevo[];
  },
) {
  const t = d.ahora.toISOString();
  base.transaccion(() => {
    const s = d.sesionId
      ? (base.db.prepare('SELECT mesa_id FROM sesiones WHERE id = ?').get(d.sesionId) as { mesa_id: string } | undefined)
      : undefined;
    base.db
      .prepare(
        `INSERT INTO pedidos (id, origen, estado, sesion_id, mesa_id, numero, dia, notas, creado_por, confirmado_por,
           confirmado_en, creado_en, actualizado_en)
         VALUES (?, ?, 'confirmado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(d.pedidoId, d.origen, d.sesionId, s?.mesa_id ?? null, d.numero, d.dia, d.notas, d.usuarioId, d.usuarioId, t, t, LOCAL);
    const ins = base.db.prepare(
      `INSERT INTO items (id, pedido_id, producto_id, nombre, precio_unitario, cantidad, seleccion, resumen_opciones,
         nota, sector_id, anulado, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    );
    for (const i of d.items) {
      ins.run(
        i.itemId, d.pedidoId, i.productoId, i.nombre, i.precioUnitario, i.cantidad, JSON.stringify(i.seleccion),
        i.resumenOpciones, i.nota, i.sectorId, t, LOCAL,
      );
    }
  });
}

export function confirmarPedidoLocal(
  base: BaseLocal,
  d: Quien & { pedidoId: string; numero: number; dia: string; ajustes: Ajuste[] },
) {
  base.transaccion(() => {
    for (const a of d.ajustes) {
      if (a.cantidad === 0) base.db.prepare('UPDATE items SET anulado = 1 WHERE id = ? AND pedido_id = ?').run(a.itemId, d.pedidoId);
      else base.db.prepare('UPDATE items SET cantidad = ? WHERE id = ? AND pedido_id = ?').run(a.cantidad, a.itemId, d.pedidoId);
    }
    base.db
      .prepare(
        "UPDATE pedidos SET estado = 'confirmado', numero = ?, dia = ?, confirmado_por = ?, confirmado_en = ? WHERE id = ?",
      )
      .run(d.numero, d.dia, d.usuarioId, d.ahora.toISOString(), d.pedidoId);
  });
}

export function rechazarPedidoLocal(base: BaseLocal, d: { pedidoId: string; motivo: string; ahora: Date }) {
  base.db
    .prepare("UPDATE pedidos SET estado = 'rechazado', motivo_rechazo = ?, rechazado_en = ? WHERE id = ?")
    .run(d.motivo, d.ahora.toISOString(), d.pedidoId);
}

export function atenderAvisoLocal(base: BaseLocal, d: Quien & { avisoId: string }) {
  base.db
    .prepare('UPDATE avisos SET atendido_en = ?, atendido_por = ? WHERE id = ? AND atendido_en IS NULL')
    .run(d.ahora.toISOString(), d.usuarioId, d.avisoId);
}

/**
 * El servidor rechazó una operación: se borra lo que la PC creó por su cuenta (el servidor no lo tiene,
 * así que el pull completo no lo pisaría). Los cambios sobre filas del servidor los revierte el pull.
 */
export function revertirOperacionLocal(base: BaseLocal, tipo: string, datos: unknown): void {
  const d = (datos ?? {}) as { sesionId?: string; pedidoId?: string };
  base.transaccion(() => {
    if (tipo === 'mesa.abrir' && d.sesionId) {
      base.db.prepare('DELETE FROM sesiones WHERE id = ? AND actualizado_en = ?').run(d.sesionId, LOCAL);
    }
    if (tipo === 'pedido.crear' && d.pedidoId) {
      const p = base.db.prepare('SELECT actualizado_en FROM pedidos WHERE id = ?').get(d.pedidoId) as
        | { actualizado_en: string }
        | undefined;
      if (p?.actualizado_en === LOCAL) {
        base.db.prepare('DELETE FROM items WHERE pedido_id = ?').run(d.pedidoId);
        base.db.prepare('DELETE FROM pedidos WHERE id = ?').run(d.pedidoId);
      }
    }
  });
}

/** Borra el salón local (al vincular la PC a otro local). */
export function vaciarSalonLocal(base: BaseLocal): void {
  base.transaccion(() =>
    base.db.exec(
      "DELETE FROM items; DELETE FROM pedidos; DELETE FROM avisos; DELETE FROM sesiones; DELETE FROM mesas; DELETE FROM kv WHERE clave LIKE 'numero:%';",
    ),
  );
}

/** Todos los pedidos de una sesión (abierta o ya cerrada), con sus ítems vigentes. */
export function pedidosDeSesion(base: BaseLocal, sesionId: string): Pedido[] {
  return conItems(
    base,
    base.db.prepare('SELECT * FROM pedidos WHERE sesion_id = ? AND eliminado_en IS NULL ORDER BY creado_en').all(sesionId) as F[],
  );
}

export function mesaDeSesion(base: BaseLocal, sesionId: string): { id: string; nombre: string } | null {
  const f = base.db
    .prepare('SELECT m.id, m.nombre FROM sesiones s JOIN mesas m ON m.id = s.mesa_id WHERE s.id = ?')
    .get(sesionId) as { id: string; nombre: string } | undefined;
  return f ? { id: f.id, nombre: f.nombre } : null;
}
