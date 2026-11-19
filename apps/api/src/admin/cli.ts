import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { crearDb, type Dbs } from '../db/cliente.js';
import { locales } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { crearLocal } from '../locales/crearLocal.js';
import { cargarCartaDemo } from './seedDemo.js';

const USO = `Uso:
  admin crear-local --nombre "<nombre>" --slug <slug> --dueno "<nombre>" --email <email> --password <password> --pin <pin>
  admin cargar-demo --slug <slug>
  admin marca --slug <slug> [--color '#b5431c'] [--logo /fotos/... | https://...]`;

const [comando, ...resto] = process.argv.slice(2);

function conexiones(): Dbs {
  const admin = process.env.DATABASE_ADMIN_URL;
  if (!admin) throw new Error('DATABASE_ADMIN_URL es obligatoria');
  return crearDb({ databaseAdminUrl: admin, databaseUrl: process.env.DATABASE_URL ?? admin });
}

async function crearLocalCli(dbs: Dbs): Promise<void> {
  const { values } = parseArgs({
    args: resto,
    options: {
      nombre: { type: 'string' },
      slug: { type: 'string' },
      dueno: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string' },
      pin: { type: 'string' },
    },
  });
  const r = await crearLocal(dbs.dbAdmin, {
    nombre: values.nombre ?? '',
    slug: values.slug ?? '',
    dueno: {
      nombre: values.dueno ?? '',
      email: values.email ?? '',
      password: values.password ?? '',
      pin: values.pin ?? '',
    },
  });
  console.log(r.localId);
}

async function cargarDemoCli(dbs: Dbs): Promise<void> {
  const { values } = parseArgs({ args: resto, options: { slug: { type: 'string' } } });
  const [local] = await dbs.dbAdmin
    .select()
    .from(locales)
    .where(eq(locales.slug, values.slug ?? ''));
  if (!local) throw new ErrorApi(404, 'LOCAL_NO_ENCONTRADO', 'No existe un local con ese slug.');
  const r = await cargarCartaDemo(dbs, local.id);
  console.log(`Carta demo cargada: ${r.categorias} categorías, ${r.productos} productos, ${r.mesas} mesas`);
}

async function marcaCli(dbs: Dbs): Promise<void> {
  const { values } = parseArgs({ args: resto, options: { slug: { type: 'string' }, color: { type: 'string' }, logo: { type: 'string' } } });
  const [local] = await dbs.dbAdmin.select().from(locales).where(eq(locales.slug, values.slug ?? ''));
  if (!local) throw new ErrorApi(404, 'LOCAL_NO_ENCONTRADO', 'No existe un local con ese slug.');
  const marca = { ...(local.marca as Record<string, unknown>) };
  if (values.color !== undefined) {
    if (!/^#[0-9a-f]{6}$/i.test(values.color)) throw new ErrorApi(400, 'DATOS_INVALIDOS', 'El color va como #rrggbb.');
    marca.colorAcento = values.color;
  }
  if (values.logo !== undefined) {
    if (!/^(/|https://)/.test(values.logo)) throw new ErrorApi(400, 'DATOS_INVALIDOS', 'El logo va como /fotos/... o https://...');
    marca.logo = values.logo;
  }
  await dbs.dbAdmin.update(locales).set({ marca }).where(eq(locales.id, local.id));
  console.log('Marca guardada:', JSON.stringify(marca));
}

const comandos: Record<string, (dbs: Dbs) => Promise<void>> = {
  marca: marcaCli,
  'crear-local': crearLocalCli,
  'cargar-demo': cargarDemoCli,
};

async function main(): Promise<void> {
  const ejecutar = comando ? comandos[comando] : undefined;
  if (!ejecutar) {
    console.error(USO);
    process.exitCode = 1;
    return;
  }
  const dbs = conexiones();
  try {
    await ejecutar(dbs);
  } catch (e) {
    if (e instanceof ErrorApi) {
      console.error(`${e.codigo}: ${e.message}`);
      process.exitCode = 1;
    } else throw e;
  } finally {
    await dbs.cerrar();
  }
}

await main();
