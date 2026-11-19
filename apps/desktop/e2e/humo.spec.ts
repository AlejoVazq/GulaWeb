import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

/**
 * Humo de punta a punta: API real (tsx) contra gula_dev + app de escritorio compilada.
 * Requiere `docker compose -f infra/compose.dev.yml up -d` y `pnpm --filter @gula/desktop build`.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const API = resolve(AQUI, '../../api');
const PUERTO = 3999;
const SERVIDOR = `http://127.0.0.1:${PUERTO}`;
const ENV_API = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: String(PUERTO),
  DATABASE_URL: 'postgres://gula_app:gula_app@localhost:5433/gula_dev',
  DATABASE_ADMIN_URL: 'postgres://postgres:postgres@localhost:5433/gula_dev',
  JWT_SECRET: 'secreto-e2e-de-al-menos-32-caracteres-xx',
  DIR_FOTOS: join(tmpdir(), 'gula-e2e-fotos'),
};
const sufijo = randomBytes(3).toString('hex');
const SLUG = `e2e-${sufijo}`;
const EMAIL = `e2e-${sufijo}@gula.test`;

let api: ChildProcess;
let app: ElectronApplication;
let datos: string;

const tsx = (args: string[]) =>
  execFileSync(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), ...args], { cwd: API, env: ENV_API, encoding: 'utf8' });

test.beforeAll(async () => {
  tsx(['src/db/migrar-cli.ts']);
  tsx(['src/admin/cli.ts', 'crear-local', '--nombre', 'Bar E2E', '--slug', SLUG, '--dueno', 'Dueña E2E', '--email', EMAIL, '--password', 'secreto123', '--pin', '1234']);
  tsx(['src/admin/cli.ts', 'cargar-demo', '--slug', SLUG]);
  api = spawn(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/server.ts'], { cwd: API, env: ENV_API, stdio: 'ignore' });
  await expect.poll(async () => (await fetch(`${SERVIDOR}/salud`).catch(() => null))?.ok ?? false, { timeout: 30_000 }).toBe(true);
  datos = mkdtempSync(join(tmpdir(), 'gula-e2e-datos-'));
  app = await electron.launch({ args: [resolve(AQUI, '..')], env: { ...process.env, GULA_SERVIDOR: SERVIDOR, GULA_DATOS: datos } });
});

test.afterAll(async () => {
  await app?.close();
  api?.kill();
  rmSync(datos, { recursive: true, force: true });
});

test('login, PIN, carta y disponibilidad sincronizada con el servidor', async () => {
  const v = await app.firstWindow();
  await v.getByLabel('Email').fill(EMAIL);
  await v.getByLabel('Contraseña').fill('secreto123');
  await v.getByRole('button', { name: 'Ingresar' }).click();

  // La PC queda vinculada; tras el login entra directo (el dueño ya está identificado).
  await expect(v.getByRole('status')).toHaveText(/En línea/, { timeout: 20_000 });
  await v.getByRole('button', { name: 'Cambiar usuario' }).click();
  await v.getByRole('button', { name: /Dueña E2E/ }).click();
  for (const d of ['1', '2', '3', '4']) await v.getByRole('button', { name: d, exact: true }).click();
  await v.getByRole('button', { name: 'Entrar' }).click();

  await v.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Carta' }).click();
  await v.getByRole('button', { name: 'Pizzas', exact: true }).click();
  const sw = v.getByRole('switch', { name: 'Muzzarella disponible' });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect(sw).not.toBeChecked();
  if (process.env.CAPTURA) {
    await v.getByRole('button', { name: 'Editar Muzzarella' }).click();
    await v.screenshot({ path: process.env.CAPTURA });
  }

  await expect
    .poll(async () => {
      const carta = (await (await fetch(`${SERVIDOR}/publico/locales/${SLUG}/carta`)).json()) as {
        categorias: { productos: { nombre: string; disponible: boolean }[] }[];
      };
      return carta.categorias.flatMap((c) => c.productos).find((p) => p.nombre === 'Muzzarella')?.disponible;
    }, { timeout: 20_000 })
    .toBe(false);
});

type Sql = ((q: TemplateStringsArray, ...v: unknown[]) => Promise<Record<string, unknown>[]>) & { end: () => Promise<void> };

/** Conexión directa a la base de desarrollo (con el driver de la API) para leer lo que la PC no muestra. */
async function base(): Promise<Sql> {
  const mod = (await import(pathToFileURL(join(API, 'node_modules/postgres/src/index.js')).href)) as { default: (url: string) => Sql };
  return mod.default(ENV_API.DATABASE_ADMIN_URL);
}

test('pedido QR: la PC abre la mesa, el cliente pide, suena la alerta, se confirma y el cliente lo ve', async () => {
  const v = await app.firstWindow();
  await v.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name: 'Mesas' }).click();
  await v.getByRole('button', { name: /^Mesa 3 / }).click();
  await v.getByRole('dialog', { name: 'Abrir Mesa 3' }).getByRole('button', { name: 'Abrir mesa' }).click();
  await expect(v.getByRole('heading', { name: 'Mesa 3' })).toBeVisible();

  const sql = await base();
  try {
    const [mesa] = await sql`select m.token from mesas m join locales l on l.id = m.local_id where l.slug = ${SLUG} and m.nombre = 'Mesa 3'`;
    const token = mesa!.token as string;
    // La apertura viaja por la outbox: el servidor la tiene enseguida.
    await expect
      .poll(async () => ((await (await fetch(`${SERVIDOR}/publico/mesas/${token}`)).json()) as { aceptaPedidos: boolean }).aceptaPedidos, {
        timeout: 20_000,
      })
      .toBe(true);

    const carta = (await (await fetch(`${SERVIDOR}/publico/locales/${SLUG}/carta`)).json()) as {
      categorias: { enHorario: boolean; productos: { id: string; nombre: string; disponible: boolean; grupos: { min: number }[] }[] }[];
    };
    const producto = carta.categorias
      .filter((c) => c.enHorario)
      .flatMap((c) => c.productos)
      .find((p) => p.disponible && p.grupos.every((g) => g.min === 0))!;

    const pedidoId = crypto.randomUUID();
    const r = await fetch(`${SERVIDOR}/publico/mesas/${token}/pedidos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: pedidoId, items: [{ productoId: producto.id, seleccion: {}, nota: '', cantidad: 2 }] }),
    });
    expect(r.status).toBe(201);

    const bandeja = v.getByRole('complementary', { name: /Pendientes/ });
    const tarjeta = bandeja.getByRole('article', { name: /Mesa 3/ });
    await expect(tarjeta).toBeVisible({ timeout: 20_000 });
    await expect(tarjeta).toContainText(`2× ${producto.nombre}`);
    await expect(v.getByText('Hay pedidos o avisos sin atender')).toBeVisible();
    if (process.env.CAPTURA_SALON) await v.screenshot({ path: process.env.CAPTURA_SALON });

    await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
    await expect(tarjeta).toBeHidden();
    await expect(v.getByText('Hay pedidos o avisos sin atender')).toBeHidden();

    await expect
      .poll(async () => ((await (await fetch(`${SERVIDOR}/publico/pedidos/${pedidoId}?token=${token}`)).json()) as { estado: string }).estado, {
        timeout: 20_000,
      })
      .toBe('confirmado');
    const [p] = await sql`select numero from pedidos where id = ${pedidoId}`;
    expect(p!.numero).toBe(1);
  } finally {
    await sql.end();
  }
});
