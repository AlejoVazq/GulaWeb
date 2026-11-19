import {
  CANTIDAD_MAXIMA,
  ITEMS_MAXIMOS,
  NOTA_MAXIMA,
  diaOperativo,
  nuevoId,
  precioUnitario,
  resumirOpciones,
  validarSeleccion,
  type Accion,
} from '@gula/shared';
import type { EventoGula, ServiciosGula } from '../compartido/ipc';
import type { ItemNuevo } from '../compartido/salon';
import type { ProductoLocal } from '../compartido/tipos';
import type { BaseLocal } from './db/base';
import { leerCarta } from './db/carta';
import { encolar } from './db/outbox';
import {
  abrirMesaLocal,
  atenderAvisoLocal,
  cerrarMesaLocal,
  confirmarPedidoLocal,
  crearPedidoLocal,
  leerMesa,
  leerSalon,
  rechazarPedidoLocal,
  siguienteNumero,
} from './db/salon';
import { ErrorGula } from './errores';

type CanalSalon = Extract<keyof ServiciosGula, `salon:${string}`>;
export type ServiciosSalon = Pick<ServiciosGula, CanalSalon>;

type Deps = {
  base: BaseLocal;
  /** Verifica sesión desbloqueada y permiso; devuelve el id del usuario que opera. */
  exigir: (accion: Accion) => string;
  emitir: (evento: EventoGula, dato: unknown) => void;
  sincronizar: () => void;
  /** Tras confirmar o crear un pedido (ya guardado): imprime sus comandas. Nunca hace fallar la operación. */
  alConfirmar?: (pedidoId: string) => void;
  ahora?: () => Date;
};

const invalido = (mensaje: string) => new ErrorGula('DATOS_INVALIDOS', mensaje);

export function crearServiciosSalon(d: Deps): ServiciosSalon {
  const ahora = d.ahora ?? (() => new Date());

  /** Cambio optimista + operación en la outbox, todo o nada; después se avisa y se intenta enviar. */
  const operar = (tipo: string, usuarioId: string, datos: object, local: () => void) => {
    d.base.transaccion(() => {
      local();
      encolar(d.base, { tipo, datos, usuarioId });
    });
    d.emitir('salon:cambio', null);
    d.sincronizar();
  };

  const imprimir = (pedidoId: string) => {
    try {
      d.alConfirmar?.(pedidoId);
    } catch (e) {
      console.error('No se pudieron encolar las comandas', e);
    }
  };

  const productos = () => {
    const mapa = new Map<string, ProductoLocal>();
    for (const c of leerCarta(d.base).categorias) for (const p of c.productos) mapa.set(p.id, p);
    return mapa;
  };

  const pedidoPendiente = (pedidoId: string) => {
    const p = leerSalon(d.base).pendientes.find((x) => x.id === pedidoId);
    if (!p) throw new ErrorGula('ESTADO_INVALIDO', 'Ese pedido ya fue confirmado o rechazado.');
    return p;
  };

  return {
    'salon:leer': async () => leerSalon(d.base),

    'salon:mesa': async (mesaId) => leerMesa(d.base, mesaId),

    'salon:abrirMesa': async ({ mesaId, comensales }) => {
      const usuarioId = d.exigir('mesa.operar');
      const m = leerMesa(d.base, mesaId);
      if (!m) throw new ErrorGula('NO_ENCONTRADO', 'No encontramos esa mesa.');
      if (m.sesion) throw new ErrorGula('MESA_OCUPADA', 'La mesa ya está abierta.');
      if (comensales != null && (!Number.isInteger(comensales) || comensales < 1 || comensales > 100))
        throw invalido('La cantidad de personas no es válida.');
      const sesionId = nuevoId();
      operar('mesa.abrir', usuarioId, { sesionId, mesaId, comensales: comensales ?? null }, () =>
        abrirMesaLocal(d.base, { sesionId, mesaId, comensales: comensales ?? null, usuarioId, ahora: ahora() }),
      );
      return { sesionId };
    },

    'salon:cerrarMesa': async ({ sesionId }) => {
      const usuarioId = d.exigir('mesa.operar');
      if (!leerSalon(d.base).mesas.some((m) => m.sesion?.id === sesionId))
        throw new ErrorGula('ESTADO_INVALIDO', 'La mesa ya está cerrada.');
      operar('mesa.cerrar', usuarioId, { sesionId }, () => cerrarMesaLocal(d.base, { sesionId, usuarioId, ahora: ahora() }));
    },

    'salon:crearPedido': async ({ origen, sesionId, notas, items }) => {
      const usuarioId = d.exigir('pedido.tomar');
      if (origen === 'manual' && !leerSalon(d.base).mesas.some((m) => m.sesion?.id === sesionId))
        throw new ErrorGula('ESTADO_INVALIDO', 'La mesa no está abierta.');
      if (!items.length || items.length > ITEMS_MAXIMOS) throw invalido('El pedido no tiene ítems.');
      const carta = productos();
      const armados: ItemNuevo[] = items.map((i) => {
        const p = carta.get(i.productoId);
        if (!p) throw invalido('Un producto del pedido ya no está en la carta.');
        if (!p.disponible) throw new ErrorGula('PRODUCTO_NO_DISPONIBLE', `"${p.nombre}" está marcado sin stock.`);
        if (!Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > CANTIDAD_MAXIMA)
          throw invalido(`Cantidad inválida para "${p.nombre}".`);
        const v = validarSeleccion(p, i.seleccion);
        if (!v.ok) throw invalido(`${p.nombre}: ${v.errores.join('. ')}`);
        return {
          itemId: nuevoId(),
          productoId: p.id,
          nombre: p.nombre,
          precioUnitario: precioUnitario(p, i.seleccion),
          cantidad: i.cantidad,
          seleccion: i.seleccion,
          resumenOpciones: resumirOpciones(p, i.seleccion),
          nota: i.nota.trim().slice(0, NOTA_MAXIMA),
          sectorId: p.sectorId,
        };
      });
      const pedidoId = nuevoId();
      const t = ahora();
      const dia = diaOperativo(t);
      const nota = notas?.trim() ? notas.trim().slice(0, NOTA_MAXIMA) : null;
      let numero = 0;
      d.base.transaccion(() => {
        numero = siguienteNumero(d.base, dia);
        crearPedidoLocal(d.base, {
          pedidoId, origen, sesionId: origen === 'manual' ? sesionId! : null, numero, dia, notas: nota, items: armados,
          usuarioId, ahora: t,
        });
        encolar(d.base, {
          tipo: 'pedido.crear',
          usuarioId,
          datos: { pedidoId, origen, sesionId: origen === 'manual' ? sesionId : null, numero, dia, notas: nota, items: armados },
        });
      });
      d.emitir('salon:cambio', null);
      d.sincronizar();
      imprimir(pedidoId);
      return { pedidoId, numero };
    },

    'salon:confirmar': async ({ pedidoId, ajustes }) => {
      const usuarioId = d.exigir('pedido.confirmar');
      const p = pedidoPendiente(pedidoId);
      const lista = ajustes ?? [];
      for (const a of lista) {
        if (!p.items.some((i) => i.id === a.itemId)) throw invalido('El ajuste incluye ítems que no son de este pedido.');
        if (!Number.isInteger(a.cantidad) || a.cantidad < 0 || a.cantidad > CANTIDAD_MAXIMA) throw invalido('Cantidad inválida.');
      }
      if (p.items.every((i) => lista.find((a) => a.itemId === i.id)?.cantidad === 0))
        throw invalido('No podés confirmar un pedido sin ítems. Rechazalo.');
      const t = ahora();
      const dia = diaOperativo(t);
      let numero = 0;
      d.base.transaccion(() => {
        numero = siguienteNumero(d.base, dia);
        confirmarPedidoLocal(d.base, { pedidoId, numero, dia, ajustes: lista, usuarioId, ahora: t });
        encolar(d.base, {
          tipo: 'pedido.confirmar',
          usuarioId,
          datos: { pedidoId, numero, dia, ...(lista.length ? { items: lista } : {}) },
        });
      });
      d.emitir('salon:cambio', null);
      d.sincronizar();
      imprimir(pedidoId);
      return { numero };
    },

    'salon:rechazar': async ({ pedidoId, motivo }) => {
      const usuarioId = d.exigir('pedido.confirmar');
      const m = motivo.trim();
      if (!m || m.length > NOTA_MAXIMA) throw invalido('Escribí el motivo del rechazo.');
      pedidoPendiente(pedidoId);
      operar('pedido.rechazar', usuarioId, { pedidoId, motivo: m }, () =>
        rechazarPedidoLocal(d.base, { pedidoId, motivo: m, ahora: ahora() }),
      );
    },

    'salon:atenderAviso': async ({ avisoId }) => {
      const usuarioId = d.exigir('mesa.operar');
      operar('aviso.atender', usuarioId, { avisoId }, () => atenderAvisoLocal(d.base, { avisoId, usuarioId, ahora: ahora() }));
    },
  };
}
