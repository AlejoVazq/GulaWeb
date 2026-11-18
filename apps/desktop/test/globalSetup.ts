import postgres from 'postgres';

/** El test de integración usa su propia base para no chocar con la suite de la API (turbo corre en paralelo). */
export default async function setup(): Promise<void> {
  const admin = postgres(process.env.TEST_DATABASE_ADMIN_URL!.replace(/\/[^/]+$/, '/postgres'), { onnotice: () => {} });
  try {
    const [existe] = await admin`select 1 from pg_database where datname = 'gula_test_desktop'`;
    if (!existe) await admin.unsafe('CREATE DATABASE gula_test_desktop');
  } finally {
    await admin.end();
  }
}
