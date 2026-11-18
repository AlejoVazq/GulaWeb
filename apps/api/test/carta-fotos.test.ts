import { it, expect, beforeEach, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { appDePrueba, bearer, escenario, pedir, type Escenario } from './app.js';
import { dbs, limpiarDb } from './db.js';

let app: FastifyInstance;
let e: Escenario;
let dir: string;
let productoId: string;
beforeEach(async () => {
  await limpiarDb();
  dir = mkdtempSync(join(tmpdir(), 'gula-fotos-'));
  app = await appDePrueba({ dirFotos: dir });
  e = await escenario(app);
  const enc = pedir(app, e.tokenEncargado);
  const categoriaId = (await enc('POST', '/carta/categorias', { nombre: 'Pizzas' })).json().id;
  productoId = (await enc('POST', '/carta/productos', { categoriaId, nombre: 'Muzza', precio: 1000 })).json().id;
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
afterAll(() => dbs.cerrar());

function multipart(contenido: Buffer, nombre = 'foto.png', tipo = 'image/png') {
  const limite = '----gula' + Math.random().toString(16).slice(2);
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    contenido,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { 'content-type': `multipart/form-data; boundary=${limite}` } };
}

const subir = (cont: Buffer, nombre?: string, tipo?: string) => {
  const m = multipart(cont, nombre, tipo);
  return app.inject({
    method: 'PUT',
    url: `/carta/productos/${productoId}/foto`,
    payload: m.payload,
    headers: { ...m.headers, ...bearer(e.tokenEncargado) },
  });
};

const png = (ancho: number, alto: number) =>
  sharp({ create: { width: ancho, height: alto, channels: 3, background: '#c0392b' } }).png().toBuffer();

it('genera dos webp optimizados y no guarda el original', async () => {
  const r = await subir(await png(1600, 1200));
  expect(r.statusCode).toBe(200);
  const { chica, grande } = r.json().foto;
  expect(chica).toMatch(/^\/fotos\/.+-400\.webp$/);
  const archivos = readdirSync(dir);
  expect(archivos.sort()).toEqual([grande.slice(7), chica.slice(7)].sort());
  const meta = await sharp(readFileSync(join(dir, grande.slice(7)))).metadata();
  expect(meta.format).toBe('webp');
  expect(meta.width).toBe(800);
});
it('texto plano responde 400 IMAGEN_INVALIDA', async () => {
  const r = await subir(Buffer.from('hola, no soy una imagen'), 'x.png');
  expect(r.statusCode).toBe(400);
  expect(r.json().error.codigo).toBe('IMAGEN_INVALIDA');
  expect(readdirSync(dir)).toEqual([]);
});
it('más de 8 MB responde 413 ARCHIVO_GRANDE', async () => {
  const r = await subir(Buffer.alloc(9 * 1024 * 1024, 1));
  expect(r.statusCode).toBe(413);
  expect(r.json().error.codigo).toBe('ARCHIVO_GRANDE');
});
it('reemplazar borra los archivos viejos y DELETE limpia todo', async () => {
  const primera = (await subir(await png(500, 500))).json().foto;
  await subir(await png(900, 600));
  expect(existsSync(join(dir, primera.chica.slice(7)))).toBe(false);
  expect(readdirSync(dir)).toHaveLength(2);
  const d = await app.inject({ method: 'DELETE', url: `/carta/productos/${productoId}/foto`, headers: bearer(e.tokenEncargado) });
  expect(d.statusCode).toBe(204);
  expect(readdirSync(dir)).toEqual([]);
});

it('rechaza SVG y formatos no permitidos', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>');
  const r = await subir(svg, 'x.svg', 'image/svg+xml');
  expect(r.statusCode).toBe(400);
  expect(r.json().error.codigo).toBe('IMAGEN_INVALIDA');
});
it('rechaza imágenes con demasiados píxeles (bomba de descompresión)', async () => {
  const r = await subir(await png(8000, 8000));
  expect(r.statusCode).toBe(400);
  expect(r.json().error.codigo).toBe('IMAGEN_INVALIDA');
  expect(readdirSync(dir)).toEqual([]);
}, 30_000);
