import { describe, expect, it } from 'vitest';
import { maquetar, type Documento } from '../src/compartido/impresion';
import type { Item, Pedido } from '../src/compartido/salon';
import { comandasDePedido, cuentaDe, ticketPrueba } from '../src/main/impresion/documentos';

const ahora = new Date('2026-11-19T00:05:00.000Z'); // 21:05 en Buenos Aires
const sectores = [
  { id: 'coc', nombre: 'Cocina' },
  { id: 'bar', nombre: 'Barra' },
];
const ctx = { local: 'Bar Gula', atendio: 'Ana', ahora, sectores };

let n = 0;
const item = (nombre: string, sectorId: string | null, extra: Partial<Item> = {}): Item => ({
  id: `i${n++}`,
  pedidoId: 'p1',
  productoId: `prod-${nombre}`,
  nombre,
  precioUnitario: 100000,
  cantidad: 1,
  seleccion: {},
  resumenOpciones: '',
  nota: '',
  sectorId,
  anulado: false,
  creadoEn: ahora.toISOString(),
  ...extra,
});
const pedido = (items: Item[], extra: Partial<Pedido & { mesa: { id: string; nombre: string } | null }> = {}): Pedido & { mesa: { id: string; nombre: string } | null } => ({
  id: 'p1',
  origen: 'manual',
  estado: 'confirmado',
  sesionId: 's1',
  mesaId: 'm3',
  numero: 12,
  dia: '2026-11-18',
  notas: null,
  motivoRechazo: null,
  creadoPor: 'u1',
  confirmadoPor: 'u1',
  confirmadoEn: ahora.toISOString(),
  rechazadoEn: null,
  creadoEn: ahora.toISOString(),
  items,
  total: items.reduce((t, i) => t + i.precioUnitario * i.cantidad, 0),
  mesa: { id: 'm3', nombre: 'Mesa 3' },
  ...extra,
});
const texto = (d: Documento, col = 48) => maquetar(d, col).map((r) => r.texto);

describe('comandas', () => {
  it('un ticket por sector, en el orden de la carta', () => {
    const p = pedido([
      item('Cerveza', 'bar'),
      item('Hamburguesa', 'coc', { cantidad: 2, resumenOpciones: 'Grande, Cheddar', nota: 'sin cebolla' }),
      item('Papas', 'coc'),
    ]);
    const c = comandasDePedido(p, ctx);
    expect(c.map((x) => x.sectorId)).toEqual(['coc', 'bar']);
    const cocina = texto(c[0]!.documento);
    expect(cocina).toContain('COCINA');
    expect(cocina).toContain('Mesa 3');
    expect(cocina.join('\n')).toContain('Pedido 12 · 21:05 · Atendió: Ana');
    expect(cocina).toContain('2x Hamburguesa');
    expect(cocina).toContain('   Grande, Cheddar');
    expect(cocina).toContain('   » sin cebolla');
    expect(cocina.join('\n')).not.toContain('Cerveza');
    expect(c[0]!.documento.titulo).toBe('Comanda Cocina · Pedido 12');
    const estilo = maquetar(c[0]!.documento, 48).find((r) => r.texto === '2x Hamburguesa')!;
    expect(estilo.tam).toBe('alto');
    expect(estilo.negrita).toBe(true);
  });

  it('ítems sin sector van a GENERAL, al final', () => {
    const c = comandasDePedido(pedido([item('Agua', null), item('Pizza', 'coc')]), ctx);
    expect(c.map((x) => x.sectorId)).toEqual(['coc', null]);
    expect(texto(c[1]!.documento)).toContain('GENERAL');
  });

  it('mostrador y notas del pedido', () => {
    const p = pedido([item('Café', 'bar')], { origen: 'mostrador', mesa: null, mesaId: null, sesionId: null, notas: 'para llevar' });
    const t = texto(comandasDePedido(p, ctx)[0]!.documento);
    expect(t).toContain('MOSTRADOR');
    expect(t.join('\n')).toContain('Nota: para llevar');
  });

  it('la reimpresión va marcada', () => {
    const [c] = comandasDePedido(pedido([item('Pizza', 'coc')]), ctx, { reimpresion: true });
    expect(texto(c!.documento)).toContain('*** REIMPRESIÓN ***');
    expect(c!.documento.titulo).toBe('Comanda Cocina · Pedido 12 (reimpresión)');
  });

  it('un nombre de 70 caracteres no pierde texto', () => {
    const largo = 'Milanesa napolitana completa con papas fritas ensalada mixta y dos huevos';
    const [c] = comandasDePedido(pedido([item(largo, 'coc')]), ctx);
    expect(texto(c!.documento).join(' ')).toContain(`1x ${largo}`.split(' ').slice(0, 4).join(' '));
    const r = maquetar(c!.documento, 48);
    expect(r.filter((x) => x.tam === 'alto' && x.negrita).map((x) => x.texto).join(' ')).toBe(`1x ${largo}`);
  });
});

describe('cuenta', () => {
  it('agrupa ítems iguales de varios pedidos y termina con la leyenda', () => {
    const a = pedido([item('Coca', 'bar', { cantidad: 2, precioUnitario: 250000 }), item('Pizza', 'coc', { precioUnitario: 1200000 })]);
    const b = pedido([item('Coca', 'bar', { cantidad: 2, precioUnitario: 250000 })], { id: 'p2', numero: 13 });
    const d = cuentaDe([a, b], { local: 'Bar Gula', atendio: 'Ana', ahora, destino: 'Mesa 3' });
    const t = texto(d);
    expect(t).toContain('Bar Gula');
    expect(t).toContain('Mesa 3');
    expect(t.find((l) => l.startsWith('4x Coca'))).toMatch(/\$ 10\.000$/);
    expect(t.find((l) => l.startsWith('TOTAL'))).toMatch(/\$ 22\.000$/);
    expect(t.at(-1)).toBe('Documento no válido como factura');
    expect(d.titulo).toBe('Cuenta Mesa 3');
  });
});

it('ticket de prueba con acentos y regla', () => {
  const t = texto(ticketPrueba('Bar Gula', 32, ahora), 32);
  expect(t.join('\n')).toContain('ñ á é í ó ú ¿ ¡');
  expect(t).toContain('1234567890'.repeat(4).slice(0, 32));
});
