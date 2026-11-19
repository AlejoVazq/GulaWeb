import { existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { crearTransporteWindows, type Ejecutar } from '../src/main/impresion/windows';
import { carpetaTemporal } from './tmp';

const tmp = carpetaTemporal();

it('el nombre de la impresora viaja por el entorno, nunca dentro del script', async () => {
  const dir = tmp.ruta('w1');
  let visto: Parameters<Ejecutar>[0] | null = null;
  let archivoExistia = false;
  const ejecutar: Ejecutar = async (o) => {
    visto = o;
    archivoExistia = existsSync(o.env.GULA_ARCHIVO!);
    return { codigo: 0, salida: '', stderr: '' };
  };
  const t = crearTransporteWindows({ ejecutar, dirTemporal: dir });
  await t.imprimir('Caja "1" $x', Uint8Array.from([1, 2, 3]));
  expect(visto!.env.GULA_IMPRESORA).toBe('Caja "1" $x');
  expect(visto!.script).not.toContain('Caja');
  expect(visto!.script).toContain('WritePrinter');
  expect(archivoExistia).toBe(true);
  expect(readdirSync(dir)).toEqual([]);
});

it('un fallo del proceso rechaza con su mensaje y no deja el temporal', async () => {
  const dir = tmp.ruta('w2');
  const ejecutar: Ejecutar = async () => ({ codigo: 1, salida: 'GULA:NO_ENCONTRADA\r\n', stderr: '' });
  const t = crearTransporteWindows({ ejecutar, dirTemporal: dir });
  await expect(t.imprimir('X', Uint8Array.from([1]))).rejects.toThrow('No se encontró la impresora "X"');
  expect(readdirSync(dir)).toEqual([]);
});

it('un error desconocido del proceso se muestra con su primera línea', async () => {
  const ejecutar: Ejecutar = async () => ({ codigo: 1, salida: '', stderr: 'Add-Type : algo falló\r\nmás detalle' });
  const t = crearTransporteWindows({ ejecutar, dirTemporal: tmp.ruta('w4') });
  await expect(t.imprimir('X', Uint8Array.from([1]))).rejects.toThrow('No se pudo imprimir: Add-Type : algo falló');
});

it.runIf(process.platform === 'win32')(
  'en Windows, una impresora que no existe da un error claro',
  async () => {
    const t = crearTransporteWindows({ dirTemporal: tmp.ruta('w3') });
    await expect(t.imprimir(`Impresora-que-no-existe-${randomUUID()}`, Uint8Array.from([0x1b, 0x40]))).rejects.toThrow(
      'No se encontró la impresora',
    );
  },
  30_000,
);
