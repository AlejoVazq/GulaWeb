import {
  LIMITES_DELIVERY,
  MONTO_MAXIMO_CAJA,
  NOTA_MAXIMA,
  avanzaReparto,
  diaOperativo,
  nuevoId,
  sinControl,
  type Accion,
} from '@gula/shared';
import type { DatosCliente } from '../compartido/delivery';
import type { EventoGula, ServiciosGula } from '../compartido/ipc';
import type { BaseLocal } from './db/base';
import { buscarCliente, crearDeliveryLocal, estadoDeliveryLocal, leerDelivery, leerTablero } from './db/delivery';
import { escribirKv, leerKv } from './db/kv';
import { encolar } from './db/outbox';
import { siguienteNumero } from './db/salon';
import { ErrorGula } from './errores';
import { armarItems } from './servicios.salon';

type Canal = Extract<keyof ServiciosGula, `delivery:${string}`>;
export type ServiciosDelivery = Pick<ServiciosGula, Canal>;

type Deps = {
  base: BaseLocal;
  exigir: (accion: Accion) => string;
  emitir: (evento: EventoGula, dato: unknown) => void;
  sincronizar: () => void;
  /** Tras crear el delivery (ya guardado): comandas por sector y ticket del repartidor. Nunca hace fallar la operación. */
  alCrear?: (pedidoId: string) => void;
  ahora?: () => Date;
};

const CLAVE_ENVIO = 'delivery:envio';
const invalido = (m: string) => new ErrorGula('DATOS_INVALIDOS', m);
const monto = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MONTO_MAXIMO_CAJA;

function limpiar(t: string | undefined, max: number, falta?: string): string {
  const v = sinControl(t ?? '');
  if (falta && !v) throw invalido(falta);
  if (v.length > max) throw invalido(`Un dato del cliente es demasiado largo (máximo ${max} caracteres).`);
  return v;
}

export function crearServiciosDelivery(d: Deps): ServiciosDelivery {
  const ahora = d.ahora ?? (() => new Date());
  const avisar = () => {
    d.emitir('salon:cambio', null);
    d.sincronizar();
  };

  return {
    'delivery:tablero': async () => leerTablero(d.base, ahora()),

    'delivery:crear': async ({ cliente, costoEnvio, pagaCon, notas, items }) => {
      const usuarioId = d.exigir('delivery.gestionar');
      const c: DatosCliente = {
        nombre: limpiar(cliente?.nombre, LIMITES_DELIVERY.nombre, 'Escribí el nombre del cliente.'),
        telefono: limpiar(cliente?.telefono, LIMITES_DELIVERY.telefono),
        direccion: limpiar(cliente?.direccion, LIMITES_DELIVERY.direccion, 'Escribí la dirección.'),
        referencias: limpiar(cliente?.referencias, LIMITES_DELIVERY.referencias),
      };
      if (!monto(costoEnvio)) throw invalido('El costo de envío no es válido.');
      if (pagaCon != null && !monto(pagaCon)) throw invalido('El monto con el que paga no es válido.');
      const armados = armarItems(d.base, items);
      const total = armados.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0) + costoEnvio;
      if (total > MONTO_MAXIMO_CAJA) throw invalido('El total supera el máximo que acepta la caja.');
      if (pagaCon != null && pagaCon < total) throw invalido('Paga con menos que el total.');
      const nota = notas?.trim() ? sinControl(notas).slice(0, NOTA_MAXIMA) : null;
      const pedidoId = nuevoId();
      const t = ahora();
      const dia = diaOperativo(t);
      let numero = 0;
      d.base.transaccion(() => {
        numero = siguienteNumero(d.base, dia);
        const datos = { pedidoId, numero, dia, notas: nota, items: armados, cliente: c, costoEnvio, pagaCon: pagaCon ?? null };
        crearDeliveryLocal(d.base, { ...datos, usuarioId, ahora: t });
        encolar(d.base, { tipo: 'delivery.crear', usuarioId, datos });
      });
      avisar();
      try {
        d.alCrear?.(pedidoId);
      } catch (e) {
        console.error('No se pudieron encolar los tickets del delivery', e);
      }
      return { pedidoId, numero };
    },

    'delivery:estado': async ({ pedidoId, estado, repartidor }) => {
      const usuarioId = d.exigir('delivery.gestionar');
      if (estado !== 'en_camino' && estado !== 'entregado') throw invalido('Estado de reparto inválido.');
      const p = leerDelivery(d.base, pedidoId);
      if (!p) throw new ErrorGula('NO_ENCONTRADO', 'No encontramos ese delivery.');
      if (p.estado === 'anulado') throw new ErrorGula('ESTADO_INVALIDO', 'Ese delivery está anulado.');
      if (!avanzaReparto(p.delivery.estado, estado)) throw new ErrorGula('ESTADO_INVALIDO', 'Ese delivery ya pasó por ese estado.');
      if (estado === 'entregado' && p.estado !== 'cobrado')
        throw new ErrorGula('CUENTA_PENDIENTE', 'Cobrá el delivery antes de marcarlo entregado.');
      const rep = repartidor?.trim() ? limpiar(repartidor, LIMITES_DELIVERY.repartidor) : null;
      d.base.transaccion(() => {
        estadoDeliveryLocal(d.base, { pedidoId, estado, repartidor: rep, ahora: ahora() });
        encolar(d.base, { tipo: 'delivery.estado', usuarioId, datos: { pedidoId, estado, ...(rep ? { repartidor: rep } : {}) } });
      });
      avisar();
    },

    'delivery:cliente': async ({ telefono }) => buscarCliente(d.base, sinControl(telefono ?? '')),

    'delivery:config': async () => ({ envio: Number(leerKv(d.base, CLAVE_ENVIO) ?? 0) }),

    'delivery:guardarConfig': async ({ envio }) => {
      d.exigir('admin.configurar');
      if (!monto(envio)) throw invalido('El costo de envío no es válido.');
      escribirKv(d.base, CLAVE_ENVIO, String(envio));
    },
  };
}
