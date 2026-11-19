import { sql, type SQL } from 'drizzle-orm';
import { METODOS_PAGO, type MetodoPago, type OrigenVenta, type Rango, type Reporte } from '@gula/shared';
import type { Tx } from '../db/cliente.js';

const n = (v: unknown) => Number(v ?? 0);

async function filas<T>(tx: Tx, q: SQL): Promise<T[]> {
  return (await tx.execute(q)) as unknown as T[];
}

const ORIGENES: OrigenVenta[] = ['salon', 'mostrador', 'delivery'];

/**
 * Reporte de un rango de días operativos (Buenos Aires; la noche hasta las 06:00 es del día anterior).
 * Con `conResultado` suma egresos, ingresos y resultado.
 */
export async function leerReporte(tx: Tx, r: Rango, conResultado: boolean): Promise<Reporte> {
  // Equivale a `dia(columna) between desde and hasta`, pero en forma de rango para que use los índices por fecha.
  const enRango = (columna: SQL) =>
    sql`${columna} >= ((${r.desde}::date + interval '6 hours') AT TIME ZONE 'America/Argentina/Buenos_Aires')
      and ${columna} < ((${r.hasta}::date + interval '1 day 6 hours') AT TIME ZONE 'America/Argentina/Buenos_Aires')`;
  const cobrosEnRango = sql`select c.*, case when c.sesion_id is not null then 'salon' else p.origen end as origen
    from cobros c left join pedidos p on p.id = c.pedido_id
    where c.eliminado_en is null and ${enRango(sql`c.cobrado_en`)}`;

  const [resumen] = await filas<{ cobros: string; ventas: string; descuentos: string }>(
    tx,
    sql`select count(*) as cobros, coalesce(sum(total), 0) as ventas, coalesce(sum(descuento), 0) as descuentos from (${cobrosEnRango}) c`,
  );
  const metodos = await filas<{ metodo: MetodoPago; monto: string; propinas: string }>(
    tx,
    sql`select pg.metodo, sum(pg.monto) as monto, sum(pg.propina) as propinas
        from pagos pg join (${cobrosEnRango}) c on c.id = pg.cobro_id
        where pg.eliminado_en is null group by pg.metodo`,
  );
  const [envios] = await filas<{ envios: string }>(
    tx,
    sql`select coalesce(sum(d.costo_envio), 0) as envios from (${cobrosEnRango}) c join deliveries d on d.id = c.pedido_id`,
  );
  const origenes = await filas<{ origen: OrigenVenta; ventas: string; cobros: string }>(
    tx,
    sql`select c.origen, sum(c.total) as ventas, count(*) as cobros from (${cobrosEnRango}) c group by c.origen`,
  );
  const horas = await filas<{ hora: number; ventas: string; cobros: string }>(
    tx,
    sql`select extract(hour from c.cobrado_en at time zone 'America/Argentina/Buenos_Aires')::int as hora,
          sum(c.total) as ventas, count(*) as cobros
        from (${cobrosEnRango}) c group by 1 order by 1`,
  );

  // Pedidos cobrados por los cobros del rango, cada uno una sola vez (una mesa puede cobrarse en dos veces).
  const pedidosCobrados = sql`select distinct p.id, coalesce(p.creado_por, p.confirmado_por) as mesero
    from (${cobrosEnRango}) c
    join pedidos p on p.id = c.pedido_id or (c.sesion_id is not null and p.sesion_id = c.sesion_id)
    where p.estado = 'cobrado' and p.eliminado_en is null`;
  const itemsVigentes = sql`select i.*, pc.mesero from items_pedido i join (${pedidosCobrados}) pc on pc.id = i.pedido_id
    where not i.anulado and i.eliminado_en is null`;
  const productos = await filas<{ producto_id: string; nombre: string; cantidad: string; importe: string }>(
    tx,
    sql`select i.producto_id, (array_agg(i.nombre order by i.creado_en desc))[1] as nombre,
          sum(i.cantidad) as cantidad, sum(i.cantidad * i.precio_unitario) as importe
        from (${itemsVigentes}) i group by i.producto_id
        order by sum(i.cantidad) desc, sum(i.cantidad * i.precio_unitario) desc limit 20`,
  );
  const meseros = await filas<{ usuario_id: string | null; nombre: string | null; pedidos: string; importe: string }>(
    tx,
    sql`select i.mesero as usuario_id, u.nombre, count(distinct i.pedido_id) as pedidos,
          sum(i.cantidad * i.precio_unitario) as importe
        from (${itemsVigentes}) i left join usuarios u on u.id = i.mesero
        group by i.mesero, u.nombre order by sum(i.cantidad * i.precio_unitario) desc`,
  );

  const cobros = n(resumen?.cobros);
  const ventas = n(resumen?.ventas);
  const reporte: Reporte = {
    ventas,
    cobros,
    ticketPromedio: cobros ? Math.round(ventas / cobros) : 0,
    propinas: metodos.reduce((s, m) => s + n(m.propinas), 0),
    descuentos: n(resumen?.descuentos),
    envios: n(envios?.envios),
    porMetodo: METODOS_PAGO.flatMap((metodo) => {
      const m = metodos.find((x) => x.metodo === metodo);
      return m ? [{ metodo, monto: n(m.monto), propinas: n(m.propinas) }] : [];
    }),
    porOrigen: ORIGENES.flatMap((origen) => {
      const o = origenes.find((x) => x.origen === origen);
      return o ? [{ origen, ventas: n(o.ventas), cobros: n(o.cobros) }] : [];
    }),
    porHora: horas.map((h) => ({ hora: n(h.hora), ventas: n(h.ventas), cobros: n(h.cobros) })),
    productos: productos.map((p) => ({ productoId: p.producto_id, nombre: p.nombre, cantidad: n(p.cantidad), importe: n(p.importe) })),
    meseros: meseros.map((m) => ({
      usuarioId: m.usuario_id,
      nombre: m.nombre ?? 'Sin asignar',
      pedidos: n(m.pedidos),
      importe: n(m.importe),
    })),
  };
  if (!conResultado) return reporte;
  const [mov] = await filas<{ egresos: string; ingresos: string }>(
    tx,
    sql`select coalesce(sum(monto) filter (where tipo = 'egreso'), 0) as egresos,
          coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ingresos
        from movimientos_caja where eliminado_en is null and ${enRango(sql`hecho_en`)}`,
  );
  const egresos = n(mov?.egresos);
  return { ...reporte, egresos, ingresos: n(mov?.ingresos), resultado: ventas - egresos };
}
