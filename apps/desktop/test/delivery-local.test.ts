import { beforeEach, expect, it } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { aplicarCambiosSalon, revertirOperacionLocal } from '../src/main/db/salon';
import { anularPedidoLocal } from '../src/main/db/caja';
import { encolar } from '../src/main/db/outbox';
import { buscarCliente, crearDeliveryLocal, estadoDeliveryLocal, leerDelivery, leerTablero } from '../src/main/db/delivery';
import type { FilaDelivery } from '../src/compartido/delivery';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
const AHORA = new Date('2026-11-19T21:00:00.000Z');
const quien = { usuarioId: 'u1', ahora: AHORA };
const cliente = { nombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: 'Timbre B' };

beforeEach(() => {
  base = abrirBase(tmp.ruta(`dl${n++}.db`));
});

function crear(pedidoId: string, extra: Partial<Parameters<typeof crearDeliveryLocal>[1]> = {}) {
  crearDeliveryLocal(base, {
    pedidoId, numero: 1, dia: '2026-11-19', notas: null, cliente, costoEnvio: 150000, pagaCon: null,
    items: [{ itemId: `${pedidoId}-i`, productoId: 'p1', nombre: 'Pizza', precioUnitario: 1000000, cantidad: 1, seleccion: {}, resumenOpciones: '', nota: '', sectorId: null }],
    ...quien,
    ...extra,
  });
}
const filaServidor = (estado: FilaDelivery['estado'], extra: Partial<FilaDelivery> = {}): FilaDelivery => ({
  id: 'd1', pedidoId: 'd1', clienteNombre: 'Juana', telefono: '1155551234', direccion: 'Av. Siempreviva 742', referencias: 'Timbre B',
  costoEnvio: 150000, pagaCon: null, repartidor: 'Juan', estado, enCaminoEn: null, entregadoEn: null,
  actualizadoEn: '2026-11-19T22:00:00.000Z', eliminadoEn: null, ...extra,
});
const pull = (deliveries: FilaDelivery[]) =>
  aplicarCambiosSalon(base, { cursor: 'x', mesas: [], sesiones: [], pedidos: [], items: [], avisos: [], deliveries });

it('un delivery nuevo está preparando y cobra ítems más envío', () => {
  crear('d1');
  const t = leerTablero(base, AHORA);
  expect(t.preparando).toHaveLength(1);
  expect(t.preparando[0]).toMatchObject({ origen: 'delivery', total: 1000000, aCobrar: 1150000, delivery: { cliente, estado: 'preparando' } });
});

it('al salir pasa a en camino con su repartidor', () => {
  crear('d1');
  estadoDeliveryLocal(base, { pedidoId: 'd1', estado: 'en_camino', repartidor: 'Juan', ahora: AHORA });
  const t = leerTablero(base, AHORA);
  expect(t.preparando).toEqual([]);
  expect(t.enCamino[0]!.delivery).toMatchObject({ estado: 'en_camino', repartidor: 'Juan', enCaminoEn: AHORA.toISOString() });
});

it('el pull pisa la versión local, salvo con una operación en vuelo', () => {
  crear('d1');
  encolar(base, { tipo: 'delivery.estado', datos: { pedidoId: 'd1', estado: 'en_camino' } });
  expect(pull([filaServidor('preparando')])).toBe(1);
  expect(leerDelivery(base, 'd1')!.delivery.estado).toBe('preparando');
  base.db.exec('DELETE FROM outbox');
  pull([filaServidor('entregado')]);
  expect(leerDelivery(base, 'd1')!.delivery).toMatchObject({ estado: 'entregado', repartidor: 'Juan' });
});

it('anular el pedido lo manda a cancelados', () => {
  crear('d1');
  anularPedidoLocal(base, { pedidoId: 'd1', motivo: 'Canceló', ...quien });
  const t = leerTablero(base, AHORA);
  expect(t.preparando).toEqual([]);
  expect(t.cancelados.map((p) => p.id)).toEqual(['d1']);
});

it('entregados y cancelados de otro día no se muestran; los activos sí', () => {
  crear('viejo', { dia: '2026-11-17' });
  crear('entregado-viejo', { dia: '2026-11-17' });
  estadoDeliveryLocal(base, { pedidoId: 'entregado-viejo', estado: 'entregado', repartidor: null, ahora: AHORA });
  const t = leerTablero(base, AHORA);
  expect(t.preparando.map((p) => p.id)).toEqual(['viejo']);
  expect(t.entregados).toEqual([]);
});

it('busca el último cliente con ese teléfono', () => {
  crear('d1', { cliente: { ...cliente, direccion: 'Vieja 1' } });
  crear('d2', { cliente: { ...cliente, direccion: 'Nueva 2' }, ahora: new Date(AHORA.getTime() + 60_000) });
  expect(buscarCliente(base, '1155551234')).toMatchObject({ direccion: 'Nueva 2' });
  expect(buscarCliente(base, '999')).toBeNull();
});

it('revertir un delivery.crear rechazado lo borra', () => {
  crear('d1');
  revertirOperacionLocal(base, 'delivery.crear', { pedidoId: 'd1' });
  expect(leerDelivery(base, 'd1')).toBeNull();
  expect(base.db.prepare('SELECT count(*) AS n FROM pedidos').get()).toEqual({ n: 0 });
});
