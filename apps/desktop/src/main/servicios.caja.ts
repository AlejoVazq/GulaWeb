import {
  METODOS_PAGO,
  MONTO_MAXIMO_CAJA,
  MOTIVO_MAXIMO,
  PAGOS_MAXIMOS,
  CATEGORIAS_MOVIMIENTO,
  montoDescuento,
  nuevoId,
  sinControl,
  type Accion,
  type Permiso,
} from '@gula/shared';
import type { Autorizacion, EventoGula, ServiciosGula, UsuarioPublico } from '../compartido/ipc';
import type { BaseLocal } from './db/base';
import {
  abrirCajaLocal,
  anularItemLocal,
  anularPedidoLocal,
  cerrarCajaLocal,
  cobrarLocal,
  leerCaja,
  movimientoLocal,
  porCobrarMostrador,
  turnoAbiertoLocal,
} from './db/caja';
import { escribirKv, leerKv } from './db/kv';
import { encolar } from './db/outbox';
import { leerPedido, leerSalon, pedidosDeSesion } from './db/salon';
import { ErrorGula } from './errores';
import { leerDelivery } from './db/delivery';

type Canal = 'caja:leer' | 'caja:abrir' | 'caja:movimiento' | 'caja:cerrar' | 'caja:cobrar' | 'salon:anularItem' | 'salon:anularPedido' | 'sesion:autorizantes';
export type ServiciosCaja = Pick<ServiciosGula, Canal>;

type Deps = {
  base: BaseLocal;
  exigir: (accion: Accion) => string;
  /** Usuario activo y su permiso para la acción (sin lanzar si necesita autorización). */
  permiso: (accion: Accion) => { usuarioId: string; permiso: Permiso };
  /** Con conexión, verifica el PIN del autorizante en el servidor; sin conexión no hace nada (lo verifica al sincronizar). */
  autorizar: (a: Autorizacion, accion: Accion) => Promise<void>;
  /** Usuarios del local (online). */
  usuarios: () => Promise<UsuarioPublico[]>;
  emitir: (evento: EventoGula, dato: unknown) => void;
  sincronizar: () => void;
  imprimirAnulacion?: (pedidoId: string, itemIds: string[] | null, motivo: string) => void;
  imprimirCierre?: (t: { fondo: number; abiertoEn: string; contado: number; esperado: number }, r: NonNullable<ReturnType<typeof leerCaja>['resumen']>) => void;
  ahora?: () => Date;
};

const invalido = (m: string) => new ErrorGula('DATOS_INVALIDOS', m);
const entero = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= MONTO_MAXIMO_CAJA;
const motivoValido = (m: string) => {
  const t = sinControl(m ?? '');
  if (!t || t.length > MOTIVO_MAXIMO) throw invalido('Escribí el motivo.');
  return t;
};

export function crearServiciosCaja(d: Deps): ServiciosCaja {
  const ahora = d.ahora ?? (() => new Date());

  const avisar = () => {
    d.emitir('caja:cambio', null);
    d.emitir('salon:cambio', null);
    d.sincronizar();
  };
  const turno = () => {
    const t = turnoAbiertoLocal(d.base);
    if (!t) throw new ErrorGula('CAJA_CERRADA', 'Abrí la caja para cobrar.');
    return t;
  };
  const sinFallar = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      console.error('No se pudo imprimir', e);
    }
  };

  /** Quién anula: con permiso directo, o mesero con la autorización de un encargado. */
  async function quienAnula(autorizacion?: Autorizacion) {
    const { usuarioId, permiso } = d.permiso('pedido.anular');
    if (permiso === 'no') throw new ErrorGula('SIN_PERMISO', 'No tenés permiso para hacer esto.');
    if (permiso === 'si') return { usuarioId, autorizacion: undefined };
    if (!autorizacion?.usuarioId || !autorizacion.pin)
      throw new ErrorGula('REQUIERE_AUTORIZACION', 'Necesitás el PIN de un encargado.');
    await d.autorizar(autorizacion, 'pedido.anular');
    return { usuarioId, autorizacion };
  }

  return {
    'caja:leer': async () => ({ ...leerCaja(d.base), porCobrar: porCobrarMostrador(d.base) }),

    'caja:abrir': async ({ fondo }) => {
      const usuarioId = d.exigir('caja.operar');
      if (!entero(fondo, 0)) throw invalido('El fondo de cambio no es válido.');
      if (turnoAbiertoLocal(d.base)) throw new ErrorGula('CAJA_ABIERTA', 'La caja ya está abierta.');
      const turnoId = nuevoId();
      d.base.transaccion(() => {
        abrirCajaLocal(d.base, { turnoId, fondo, usuarioId, ahora: ahora() });
        encolar(d.base, { tipo: 'caja.abrir', datos: { turnoId, fondo }, usuarioId });
      });
      avisar();
    },

    'caja:movimiento': async ({ tipo, categoria, monto, motivo }) => {
      const usuarioId = d.exigir('caja.operar');
      const t = turnoAbiertoLocal(d.base);
      if (!t) throw new ErrorGula('CAJA_CERRADA', 'La caja está cerrada.');
      if (tipo !== 'ingreso' && tipo !== 'egreso') throw invalido('Elegí ingreso o egreso.');
      if (!CATEGORIAS_MOVIMIENTO.includes(categoria)) throw invalido('Elegí una categoría.');
      if (!entero(monto, 1)) throw invalido('El monto no es válido.');
      const m = motivoValido(motivo);
      const movimientoId = nuevoId();
      d.base.transaccion(() => {
        movimientoLocal(d.base, { movimientoId, turnoId: t.id, tipo, categoria, monto, motivo: m, usuarioId, ahora: ahora() });
        encolar(d.base, { tipo: 'caja.movimiento', datos: { movimientoId, turnoId: t.id, tipo, categoria, monto, motivo: m }, usuarioId });
      });
      avisar();
    },

    'caja:cerrar': async ({ contado, notas }) => {
      const usuarioId = d.exigir('caja.operar');
      if (!entero(contado, 0)) throw invalido('El efectivo contado no es válido.');
      const c = leerCaja(d.base);
      if (!c.turno || !c.resumen) throw new ErrorGula('CAJA_CERRADA', 'La caja ya está cerrada.');
      const t = c.turno;
      const esperado = c.resumen.efectivoEsperado;
      const nota = notas?.trim() ? sinControl(notas).slice(0, 280) : null;
      d.base.transaccion(() => {
        cerrarCajaLocal(d.base, { turnoId: t.id, contado, esperado, notas: nota, usuarioId, ahora: ahora() });
        encolar(d.base, { tipo: 'caja.cerrar', datos: { turnoId: t.id, contado, notas: nota }, usuarioId });
      });
      avisar();
      sinFallar(() => d.imprimirCierre?.({ fondo: t.fondo, abiertoEn: t.abiertoEn, contado, esperado }, c.resumen!));
      return { esperado, diferencia: contado - esperado };
    },

    'caja:cobrar': async ({ destino, descuento, pagos }) => {
      const usuarioId = d.exigir('cobro.registrar');
      const t = turno();
      let sesionId: string | null = null;
      let pedidoId: string | null = null;
      let subtotal: number;
      let pedidoIds: string[] = [];
      if ('sesionId' in destino) {
        sesionId = destino.sesionId;
        if (!leerSalon(d.base).mesas.some((m) => m.sesion?.id === sesionId))
          throw new ErrorGula('ESTADO_INVALIDO', 'La mesa ya está cerrada (¿ya se cobró?).');
        const confirmados = pedidosDeSesion(d.base, sesionId).filter((p) => p.estado === 'confirmado');
        pedidoIds = confirmados.map((p) => p.id);
        subtotal = confirmados.reduce((s, p) => s + p.total, 0);
      } else {
        const p = leerPedido(d.base, destino.pedidoId);
        if (!p || p.sesionId || p.estado !== 'confirmado') throw new ErrorGula('ESTADO_INVALIDO', 'Ese pedido ya se cobró o se anuló.');
        pedidoId = p.id;
        // Un delivery cobra también el envío.
        subtotal = p.origen === 'delivery' ? (leerDelivery(d.base, p.id)?.aCobrar ?? p.total) : p.total;
      }
      if (subtotal <= 0) throw new ErrorGula('ESTADO_INVALIDO', 'No hay nada para cobrar.');
      if (subtotal > MONTO_MAXIMO_CAJA) throw invalido('El total supera el máximo que acepta la caja.');
      let desc = 0;
      let motivoDescuento: string | null = null;
      if (descuento && descuento.valor) {
        try {
          desc = montoDescuento(subtotal, descuento);
        } catch {
          throw invalido('El descuento no es válido.');
        }
        if (desc) motivoDescuento = motivoValido(descuento.motivo);
      }
      if (pagos.length > PAGOS_MAXIMOS) throw invalido(`Como máximo ${PAGOS_MAXIMOS} pagos.`);
      for (const p of pagos) {
        if (!METODOS_PAGO.includes(p.metodo)) throw invalido('Elegí el método de pago.');
        if (!entero(p.monto, 1) || !entero(p.propina, 0)) throw invalido('Un monto de pago no es válido.');
      }
      const total = subtotal - desc;
      if (pagos.reduce((s, p) => s + p.monto, 0) !== total) throw invalido('Los pagos no suman el total a cobrar.');
      const cobroId = nuevoId();
      const conIds = pagos.map((p) => ({ pagoId: nuevoId(), metodo: p.metodo, monto: p.monto, propina: p.propina }));
      d.base.transaccion(() => {
        cobrarLocal(d.base, {
          cobroId, turnoId: t.id, sesionId, pedidoId, subtotal, descuento: desc, motivoDescuento, pagos: conIds, usuarioId, ahora: ahora(),
        });
        encolar(d.base, {
          tipo: 'cuenta.cobrar',
          usuarioId,
          datos: {
            cobroId, turnoId: t.id, sesionId, pedidoId, subtotal, ...(sesionId ? { pedidoIds } : {}),
            descuento: desc ? { monto: desc, motivo: motivoDescuento } : null,
            pagos: conIds,
          },
        });
      });
      avisar();
      return { cobroId, total };
    },

    'salon:anularItem': async ({ itemId, motivo, autorizacion }) => {
      const m = motivoValido(motivo);
      const f = d.base.db.prepare('SELECT pedido_id FROM items WHERE id = ? AND anulado = 0').get(itemId) as { pedido_id: string } | undefined;
      const p = f ? leerPedido(d.base, f.pedido_id) : null;
      if (!p || p.estado !== 'confirmado') throw new ErrorGula('ESTADO_INVALIDO', 'Solo se anula lo confirmado y todavía sin cobrar.');
      const q = await quienAnula(autorizacion);
      d.base.transaccion(() => {
        anularItemLocal(d.base, { itemId, pedidoId: p.id, motivo: m, usuarioId: q.usuarioId, ahora: ahora() });
        encolar(d.base, { tipo: 'item.anular', datos: { itemId, pedidoId: p.id, motivo: m }, usuarioId: q.usuarioId, autorizacion: q.autorizacion });
      });
      avisar();
      sinFallar(() => d.imprimirAnulacion?.(p.id, [itemId], m));
    },

    'salon:anularPedido': async ({ pedidoId, motivo, autorizacion }) => {
      const m = motivoValido(motivo);
      const p = leerPedido(d.base, pedidoId);
      if (!p || p.estado !== 'confirmado') throw new ErrorGula('ESTADO_INVALIDO', 'Solo se anula lo confirmado y todavía sin cobrar.');
      const q = await quienAnula(autorizacion);
      d.base.transaccion(() => {
        anularPedidoLocal(d.base, { pedidoId, motivo: m, usuarioId: q.usuarioId, ahora: ahora() });
        encolar(d.base, { tipo: 'pedido.anular', datos: { pedidoId, motivo: m }, usuarioId: q.usuarioId, autorizacion: q.autorizacion });
      });
      avisar();
      sinFallar(() => d.imprimirAnulacion?.(pedidoId, null, m));
    },

    'sesion:autorizantes': async () => {
      let lista: UsuarioPublico[];
      try {
        lista = await d.usuarios();
        escribirKv(d.base, 'usuarios', JSON.stringify(lista));
      } catch {
        // Sin conexión: la última lista conocida.
        lista = JSON.parse(leerKv(d.base, 'usuarios') ?? '[]') as UsuarioPublico[];
      }
      return lista.filter((u) => u.rol === 'encargado' || u.rol === 'dueno');
    },
  };
}
