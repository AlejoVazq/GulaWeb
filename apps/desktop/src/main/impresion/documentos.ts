import { formatearPrecio } from '@gula/shared';
import type { Documento, Linea } from '../../compartido/impresion';
import type { Pedido } from '../../compartido/salon';

export type PedidoImprimible = Pedido & { mesa: { id: string; nombre: string } | null };
export type Contexto = { local: string; atendio: string; ahora: Date; sectores: { id: string; nombre: string }[] };

const ZONA = 'America/Argentina/Buenos_Aires';
const hora = (d: Date) =>
  d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA });
const fecha = (d: Date) =>
  d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA });

const destinoDe = (p: PedidoImprimible) => p.mesa?.nombre ?? (p.origen === 'mostrador' ? 'MOSTRADOR' : 'SIN MESA');

/** Un ticket por sector presente en el pedido, en el orden de la carta; lo que no tiene sector va a GENERAL al final. */
export function comandasDePedido(
  p: PedidoImprimible,
  ctx: Contexto,
  opciones: { reimpresion?: boolean } = {},
): { sectorId: string | null; documento: Documento }[] {
  const conocidos = new Set(ctx.sectores.map((s) => s.id));
  const grupos: { sectorId: string | null; nombre: string }[] = [
    ...ctx.sectores.filter((s) => p.items.some((i) => i.sectorId === s.id)).map((s) => ({ sectorId: s.id, nombre: s.nombre })),
  ];
  if (p.items.some((i) => !i.sectorId || !conocidos.has(i.sectorId))) grupos.push({ sectorId: null, nombre: 'General' });

  return grupos.map((g) => {
    const items = p.items.filter((i) => (g.sectorId ? i.sectorId === g.sectorId : !i.sectorId || !conocidos.has(i.sectorId)));
    const l: Linea[] = [];
    if (opciones.reimpresion) l.push({ tipo: 'texto', texto: '*** REIMPRESIÓN ***', alinear: 'centro', negrita: true });
    l.push(
      { tipo: 'texto', texto: g.nombre.toUpperCase(), tam: 'doble', alinear: 'centro', negrita: true },
      { tipo: 'texto', texto: destinoDe(p), tam: 'doble', alinear: 'centro' },
      {
        tipo: 'texto',
        texto: `Pedido ${p.numero ?? '-'} · ${hora(new Date(p.confirmadoEn ?? p.creadoEn))} · Atendió: ${ctx.atendio}`,
        alinear: 'centro',
      },
      { tipo: 'separador' },
    );
    for (const i of items) {
      l.push({ tipo: 'texto', texto: `${i.cantidad}x ${i.nombre}`, tam: 'alto', negrita: true });
      if (i.resumenOpciones) l.push({ tipo: 'texto', texto: i.resumenOpciones, sangria: 3 });
      if (i.nota) l.push({ tipo: 'texto', texto: `» ${i.nota}`, sangria: 3, tam: 'alto' });
    }
    if (p.notas) l.push({ tipo: 'separador' }, { tipo: 'texto', texto: `Nota: ${p.notas}`, tam: 'alto', negrita: true });
    const titulo = `Comanda ${g.nombre} · Pedido ${p.numero ?? '-'}${opciones.reimpresion ? ' (reimpresión)' : ''}`;
    return { sectorId: g.sectorId, documento: { titulo, lineas: l } };
  });
}

/** Ticket de cuenta no fiscal: ítems iguales (nombre, opciones y precio) se suman en una línea. */
export function cuentaDe(
  pedidos: Pedido[],
  ctx: { local: string; atendio: string; ahora: Date; destino: string },
): Documento {
  const filas = new Map<string, { texto: string; cantidad: number; precio: number }>();
  for (const p of pedidos)
    for (const i of p.items) {
      const clave = `${i.nombre}|${i.resumenOpciones}|${i.precioUnitario}`;
      const f = filas.get(clave) ?? {
        texto: i.resumenOpciones ? `${i.nombre} (${i.resumenOpciones})` : i.nombre,
        cantidad: 0,
        precio: i.precioUnitario,
      };
      f.cantidad += i.cantidad;
      filas.set(clave, f);
    }
  const total = [...filas.values()].reduce((t, f) => t + f.cantidad * f.precio, 0);
  const l: Linea[] = [
    { tipo: 'texto', texto: ctx.local, tam: 'doble', alinear: 'centro', negrita: true },
    { tipo: 'texto', texto: ctx.destino, alinear: 'centro', tam: 'alto' },
    { tipo: 'texto', texto: `${fecha(ctx.ahora)} ${hora(ctx.ahora)} · Atendió: ${ctx.atendio}`, alinear: 'centro' },
    { tipo: 'separador' },
    ...[...filas.values()].map((f): Linea => ({ tipo: 'par', izq: `${f.cantidad}x ${f.texto}`, der: formatearPrecio(f.cantidad * f.precio) })),
    { tipo: 'separador' },
    { tipo: 'par', izq: 'TOTAL', der: formatearPrecio(total), tam: 'alto', negrita: true },
    { tipo: 'espacio' },
    { tipo: 'texto', texto: 'Documento no válido como factura', alinear: 'centro' },
  ];
  return { titulo: `Cuenta ${ctx.destino}`, lineas: l };
}

export function ticketPrueba(local: string, columnas: number, ahora: Date): Documento {
  return {
    titulo: 'Prueba de impresión',
    lineas: [
      { tipo: 'texto', texto: 'PRUEBA', tam: 'doble', alinear: 'centro', negrita: true },
      { tipo: 'texto', texto: local, alinear: 'centro' },
      { tipo: 'texto', texto: `${fecha(ahora)} ${hora(ahora)}`, alinear: 'centro' },
      { tipo: 'separador' },
      { tipo: 'texto', texto: '1234567890'.repeat(5).slice(0, columnas) },
      { tipo: 'texto', texto: 'ñ á é í ó ú ¿ ¡ Ñ Á É Í Ó Ú ü' },
      { tipo: 'texto', texto: 'Texto alto', tam: 'alto' },
      { tipo: 'texto', texto: 'Texto doble', tam: 'doble' },
      { tipo: 'texto', texto: 'Negrita', negrita: true },
      { tipo: 'par', izq: 'Izquierda', der: 'Derecha' },
      { tipo: 'separador' },
      { tipo: 'texto', texto: 'Si ves todo bien, la impresora está lista.', alinear: 'centro' },
    ],
  };
}
