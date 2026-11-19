import { beforeEach, expect, it, vi } from 'vitest';
import { abrirBase, type BaseLocal } from '../src/main/db/base';
import { crearColaImpresion } from '../src/main/impresion/cola';
import type { Transporte } from '../src/main/impresion/windows';
import type { Documento } from '../src/compartido/impresion';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();
let base: BaseLocal;
let n = 0;
beforeEach(() => {
  base = abrirBase(tmp.ruta(`c${n++}.db`));
});

const doc = (titulo: string): Documento => ({ titulo, lineas: [{ tipo: 'texto', texto: titulo }] });

function armar(transporte: Transporte, modo: 'impresora' | 'vista_previa' = 'impresora') {
  const alVistaPrevia = vi.fn();
  const alCambiar = vi.fn();
  const cola = crearColaImpresion({ base, transporte, alVistaPrevia, alCambiar });
  cola.fijarConfig({ modo, impresora: modo === 'impresora' ? 'Termica' : null, columnas: 48 });
  return { cola, alVistaPrevia, alCambiar };
}

it('sin configurar, imprime en vista previa', () => {
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  expect(cola.config()).toEqual({ modo: 'vista_previa', impresora: null, columnas: 48 });
});

it('si la impresora falla, el ticket queda con error y se puede reintentar', async () => {
  let sana = false;
  const transporte: Transporte = {
    imprimir: vi.fn(async () => {
      if (!sana) throw new Error('La impresora no aceptó el trabajo.');
    }),
  };
  const { cola, alCambiar } = armar(transporte);
  cola.encolar([{ tipo: 'comanda', pedidoId: 'p1', sectorId: 's1', documento: doc('Comanda Cocina · Pedido 1') }]);
  await cola.esperar();
  const { conError } = cola.trabajos();
  expect(conError).toHaveLength(1);
  expect(conError[0]).toMatchObject({ titulo: 'Comanda Cocina · Pedido 1', estado: 'error', error: 'La impresora no aceptó el trabajo.' });
  expect(alCambiar).toHaveBeenCalled();

  sana = true;
  cola.reintentar(conError[0]!.id);
  await cola.esperar();
  expect(cola.trabajos().conError).toHaveLength(0);
  expect(cola.trabajos().recientes[0]).toMatchObject({ estado: 'impresa' });
  expect(transporte.imprimir).toHaveBeenCalledTimes(2);
});

it('descartar saca el ticket de los errores', async () => {
  const { cola } = armar({ imprimir: async () => Promise.reject(new Error('sin papel')) });
  cola.encolar([{ tipo: 'cuenta', documento: doc('Cuenta Mesa 1') }]);
  await cola.esperar();
  cola.descartar(cola.trabajos().conError[0]!.id);
  expect(cola.trabajos().conError).toHaveLength(0);
  expect(cola.trabajos().recientes[0]!.estado).toBe('descartada');
});

it('los tickets salen en orden y de a uno', async () => {
  const enviados: string[] = [];
  let enCurso = 0;
  let maximo = 0;
  const transporte: Transporte = {
    imprimir: async (_i, datos) => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 5));
      enviados.push(Buffer.from(datos).toString('latin1'));
      enCurso--;
    },
  };
  const { cola } = armar(transporte);
  cola.encolar([{ tipo: 'comanda', documento: doc('AAA') }, { tipo: 'comanda', documento: doc('BBB') }]);
  cola.encolar([{ tipo: 'comanda', documento: doc('CCC') }]);
  await cola.esperar();
  expect(maximo).toBe(1);
  expect(enviados.map((e) => ['AAA', 'BBB', 'CCC'].find((x) => e.includes(x)))).toEqual(['AAA', 'BBB', 'CCC']);
});

it('sin impresora elegida, el ticket queda con error', async () => {
  const cola = crearColaImpresion({ base, transporte: { imprimir: vi.fn() }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  cola.fijarConfig({ modo: 'impresora', impresora: null, columnas: 48 });
  cola.encolar([{ tipo: 'prueba', documento: doc('Prueba') }]);
  await cola.esperar();
  expect(cola.trabajos().conError[0]!.error).toBe('No hay impresora elegida. Elegila en Impresión.');
});

it('en vista previa entrega el documento y lo da por impreso', async () => {
  const imprimir = vi.fn();
  const { cola, alVistaPrevia } = armar({ imprimir }, 'vista_previa');
  cola.encolar([{ tipo: 'comanda', documento: doc('Comanda') }]);
  await cola.esperar();
  expect(alVistaPrevia).toHaveBeenCalledWith(doc('Comanda'), 48);
  expect(imprimir).not.toHaveBeenCalled();
  expect(cola.trabajos().recientes[0]!.estado).toBe('impresa');
});

it('al abrir, lo que estaba imprimiéndose queda como error y no se reenvía solo', async () => {
  // Simula un cierre en medio de la impresión: el trabajo quedó 'imprimiendo' en la base.
  const colgado: Transporte = { imprimir: () => new Promise(() => {}) };
  const { cola } = armar(colgado);
  cola.encolar([{ tipo: 'comanda', documento: doc('Comanda Cocina · Pedido 7') }]);
  await new Promise((r) => setTimeout(r, 10));

  const imprimir = vi.fn(async () => {});
  const otra = crearColaImpresion({ base, transporte: { imprimir }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  otra.recuperar();
  await otra.esperar();
  expect(imprimir).not.toHaveBeenCalled();
  expect(otra.trabajos().conError[0]).toMatchObject({
    titulo: 'Comanda Cocina · Pedido 7',
    error: 'La app se cerró mientras imprimía: no sabemos si salió.',
  });
});

it('al abrir, lo pendiente se imprime', async () => {
  base.db
    .prepare(
      `INSERT INTO impresiones (id, tipo, titulo, documento, estado, intentos, creada_en)
       VALUES ('019a0000-0000-7000-8000-000000000001', 'comanda', 'X', ?, 'pendiente', 0, '2026-11-18T20:00:00Z')`,
    )
    .run(JSON.stringify(doc('X')));
  const imprimir = vi.fn(async () => {});
  const cola = crearColaImpresion({ base, transporte: { imprimir }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  cola.fijarConfig({ modo: 'impresora', impresora: 'Termica', columnas: 48 });
  cola.recuperar();
  await cola.esperar();
  expect(imprimir).toHaveBeenCalledTimes(1);
});

it('un ticket encolado justo cuando termina el anterior también sale', async () => {
  for (let espera = 0; espera < 6; espera++) {
    const { cola, alVistaPrevia } = armar({ imprimir: vi.fn() }, 'vista_previa');
    cola.encolar([{ tipo: 'comanda', documento: doc('A') }]);
    for (let i = 0; i < espera; i++) await Promise.resolve();
    cola.encolar([{ tipo: 'comanda', documento: doc('B') }]);
    await cola.esperar();
    expect(alVistaPrevia.mock.calls.map((c) => (c[0] as Documento).titulo)).toEqual(['A', 'B']);
    base = abrirBase(tmp.ruta(`c${n++}.db`));
  }
});

it('un ticket roto en la base no traba la cola ni deja promesas sin atrapar', async () => {
  base.db
    .prepare(
      `INSERT INTO impresiones (id, tipo, titulo, documento, estado, intentos, creada_en)
       VALUES ('019a0000-0000-7000-8000-000000000001', 'comanda', 'Roto', '{no es json', 'pendiente', 0, '2026-11-18T20:00:00Z')`,
    )
    .run();
  const imprimir = vi.fn(async () => {});
  const cola = crearColaImpresion({ base, transporte: { imprimir }, alVistaPrevia: vi.fn(), alCambiar: vi.fn() });
  cola.fijarConfig({ modo: 'impresora', impresora: 'Termica', columnas: 48 });
  cola.encolar([{ tipo: 'comanda', documento: doc('Sana') }]);
  await cola.esperar();
  expect(imprimir).toHaveBeenCalledTimes(1);
  expect(cola.trabajos().conError.map((t) => t.titulo)).toEqual(['Roto']);
});

it('si la base se cierra mientras imprime, el trabajador termina sin romper', async () => {
  let soltar = () => {};
  const transporte: Transporte = { imprimir: () => new Promise<void>((r) => (soltar = r)) };
  const { cola } = armar(transporte);
  cola.encolar([{ tipo: 'comanda', documento: doc('A') }]);
  await new Promise((r) => setTimeout(r, 5));
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  base.cerrar();
  soltar();
  await expect(cola.esperar()).resolves.toBeUndefined();
  error.mockRestore();
});
