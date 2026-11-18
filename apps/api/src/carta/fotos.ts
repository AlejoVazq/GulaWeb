import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { productos } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { buscarVigente, paramId, urlsFoto } from './comun.js';

export const MAX_FOTO_BYTES = 8 * 1024 * 1024;
const ANCHOS = [400, 800] as const;
/** ~40 MP: más que cualquier foto de celular, mucho menos que una bomba de descompresión. */
export const MAX_PIXELES = 40_000_000;
const FORMATOS = new Set(['jpeg', 'png', 'webp', 'heif', 'avif']);

const archivos = (dir: string, base: string) => ANCHOS.map((a) => join(dir, `${base}-${a}.webp`));

async function borrarArchivos(dir: string, base: string | null) {
  if (!base) return;
  await Promise.all(archivos(dir, base).map((f) => rm(f, { force: true })));
}

/** Genera las variantes webp (rotación EXIF, sin metadatos). Nunca guarda el original. */
async function procesar(dir: string, base: string, original: Buffer): Promise<void> {
  let imagen: sharp.Sharp;
  try {
    imagen = sharp(original, { failOn: 'error', limitInputPixels: MAX_PIXELES }).rotate();
    const meta = await imagen.metadata();
    if (!meta.format || !FORMATOS.has(meta.format)) throw new Error('formato no permitido');
    if ((meta.width ?? 0) * (meta.height ?? 0) > MAX_PIXELES) throw new Error('demasiados píxeles');
  } catch {
    throw new ErrorApi(400, 'IMAGEN_INVALIDA', 'El archivo no es una imagen válida.');
  }
  await mkdir(dir, { recursive: true });
  try {
    for (const [i, ancho] of ANCHOS.entries()) {
      const buf = await imagen
        .clone()
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      await writeFile(archivos(dir, base)[i]!, buf);
    }
  } catch (e) {
    await borrarArchivos(dir, base);
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi(400, 'IMAGEN_INVALIDA', 'El archivo no es una imagen válida.');
  }
}

export async function rutasFotos(
  app: FastifyInstance,
  { dbs, dirFotos }: { dbs: Dbs; dirFotos: string },
) {
  await app.register(multipart, { limits: { fileSize: MAX_FOTO_BYTES, files: 1, fields: 0 } });
  const editar = { preHandler: [app.autenticar, app.requierePermiso('carta.editar')] };

  app.put('/carta/productos/:id/foto', editar, async (req) => {
    const { id } = paramId.parse(req.params);
    const { localId } = req.sesion;
    // Verifica existencia antes de leer el archivo.
    await conLocal(dbs.dbApp, localId, (tx) => buscarVigente(tx, productos, id, 'ese producto'));
    const archivo = await req.file();
    if (!archivo) throw new ErrorApi(400, 'IMAGEN_INVALIDA', 'Falta el archivo "foto".');
    const original = await archivo.toBuffer();

    const base = `${localId}-${id}-${randomBytes(4).toString('hex')}`;
    await procesar(dirFotos, base, original);
    const anterior = await conLocal(dbs.dbApp, localId, async (tx) => {
      const p = await buscarVigente(tx, productos, id, 'ese producto');
      await tx.update(productos).set({ foto: base }).where(eq(productos.id, id));
      return p.foto;
    });
    await borrarArchivos(dirFotos, anterior);
    return { foto: urlsFoto(base) };
  });

  app.delete('/carta/productos/:id/foto', editar, async (req, reply) => {
    const { id } = paramId.parse(req.params);
    const anterior = await conLocal(dbs.dbApp, req.sesion.localId, async (tx) => {
      const p = await buscarVigente(tx, productos, id, 'ese producto');
      await tx.update(productos).set({ foto: null }).where(eq(productos.id, id));
      return p.foto;
    });
    await borrarArchivos(dirFotos, anterior);
    return reply.status(204).send();
  });
}
