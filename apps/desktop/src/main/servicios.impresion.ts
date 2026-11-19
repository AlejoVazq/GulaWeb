import type { Accion } from '@gula/shared';
import type { ConfigImpresion } from '../compartido/impresion';
import type { ServiciosGula } from '../compartido/ipc';
import type { BaseLocal } from './db/base';
import { leerSectores } from './db/carta';
import { leerPedido, mesaDeSesion, pedidosDeSesion } from './db/salon';
import type { ColaImpresion } from './impresion/cola';
import { comandasDePedido, cuentaDe, ticketPrueba } from './impresion/documentos';
import { ErrorGula } from './errores';

type CanalImpresion = Extract<keyof ServiciosGula, `impresion:${string}`>;
export type ServiciosImpresion = Pick<ServiciosGula, CanalImpresion>;

type Deps = {
  base: BaseLocal;
  cola: ColaImpresion;
  exigir: (accion: Accion) => string;
  /** Nombre del local y del usuario activo (para el encabezado de los tickets). */
  quien: () => { local: string; usuario: string };
  listarImpresoras: () => Promise<string[]>;
  ahora?: () => Date;
};

export function crearServiciosImpresion(d: Deps) {
  const ahora = d.ahora ?? (() => new Date());

  /** Encola un ticket por sector del pedido. Lo usan la confirmación automática y la reimpresión. */
  function comandas(pedidoId: string, opciones: { reimpresion?: boolean } = {}) {
    const p = leerPedido(d.base, pedidoId);
    if (!p) throw new ErrorGula('NO_ENCONTRADO', 'No encontramos ese pedido.');
    if (p.estado !== 'confirmado') throw new ErrorGula('ESTADO_INVALIDO', 'Solo se imprimen pedidos confirmados.');
    const q = d.quien();
    const docs = comandasDePedido(p, { local: q.local, atendio: q.usuario, ahora: ahora(), sectores: leerSectores(d.base) }, opciones);
    d.cola.encolar(docs.map((c) => ({ tipo: 'comanda', pedidoId, sectorId: c.sectorId, documento: c.documento })));
  }

  const validarConfig = (c: ConfigImpresion) => {
    if ((c.modo !== 'impresora' && c.modo !== 'vista_previa') || (c.columnas !== 48 && c.columnas !== 32))
      throw new ErrorGula('DATOS_INVALIDOS', 'La configuración de impresión no es válida.');
    if (c.modo === 'impresora' && !c.impresora?.trim()) throw new ErrorGula('DATOS_INVALIDOS', 'Elegí una impresora.');
  };

  const servicios: ServiciosImpresion = {
    'impresion:config': async () => ({ ...d.cola.config(), impresoras: await d.listarImpresoras().catch(() => []) }),

    'impresion:guardarConfig': async (c) => {
      d.exigir('impresion.configurar');
      validarConfig(c);
      d.cola.fijarConfig({ modo: c.modo, impresora: c.impresora?.trim() || null, columnas: c.columnas });
    },

    'impresion:prueba': async () => {
      d.exigir('impresion.configurar');
      d.cola.encolar([{ tipo: 'prueba', documento: ticketPrueba(d.quien().local, d.cola.config().columnas, ahora()) }]);
    },

    'impresion:trabajos': async () => d.cola.trabajos(),

    'impresion:reimprimir': async ({ pedidoId }) => {
      d.exigir('comanda.imprimir');
      comandas(pedidoId, { reimpresion: true });
    },

    'impresion:cuenta': async (a) => {
      d.exigir('comanda.imprimir');
      const q = d.quien();
      let destino: string;
      let pedidos;
      if ('sesionId' in a) {
        const mesa = mesaDeSesion(d.base, a.sesionId);
        if (!mesa) throw new ErrorGula('NO_ENCONTRADO', 'No encontramos esa mesa.');
        destino = mesa.nombre;
        pedidos = pedidosDeSesion(d.base, a.sesionId).filter((p) => p.estado === 'confirmado');
      } else {
        const p = leerPedido(d.base, a.pedidoId);
        if (!p) throw new ErrorGula('NO_ENCONTRADO', 'No encontramos ese pedido.');
        destino = p.mesa?.nombre ?? `Mostrador · Pedido ${p.numero ?? '-'}`;
        pedidos = [p];
      }
      if (!pedidos.some((p) => p.items.length)) throw new ErrorGula('ESTADO_INVALIDO', 'No hay nada confirmado para cobrar.');
      d.cola.encolar([{ tipo: 'cuenta', documento: cuentaDe(pedidos, { local: q.local, atendio: q.usuario, ahora: ahora(), destino }) }]);
    },

    'impresion:reintentar': async ({ id }) => {
      d.exigir('comanda.imprimir');
      d.cola.reintentar(id);
    },

    'impresion:descartar': async ({ id }) => {
      d.exigir('comanda.imprimir');
      d.cola.descartar(id);
    },
  };

  return { servicios, comandas };
}
