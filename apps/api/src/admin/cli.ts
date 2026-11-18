import { parseArgs } from 'node:util';
import { crearDb } from '../db/cliente.js';
import { ErrorApi } from '../errores.js';
import { crearLocal } from '../locales/crearLocal.js';

const [comando, ...resto] = process.argv.slice(2);

async function main(): Promise<void> {
  if (comando !== 'crear-local') {
    console.error(
      'Uso: admin crear-local --nombre "<nombre>" --slug <slug> --dueno "<nombre>" --email <email> --password <password> --pin <pin>',
    );
    process.exitCode = 1;
    return;
  }
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
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error('DATABASE_ADMIN_URL es obligatoria');
  const dbs = crearDb({ databaseAdminUrl: url, databaseUrl: url });
  try {
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
