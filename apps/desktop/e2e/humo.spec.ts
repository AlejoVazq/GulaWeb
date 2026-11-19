import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { formatearPrecio } from '@gula/shared';

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

const lanzarApi = async () => {
  api = spawn(process.execPath, [join(API, 'node_modules/tsx/dist/cli.mjs'), 'src/server.ts'], { cwd: API, env: ENV_API, stdio: 'ignore' });
  await expect.poll(async () => (await fetch(`${SERVIDOR}/salud`).catch(() => null))?.ok ?? false, { timeout: 30_000 }).toBe(true);
};
const matarApi = async () => {
  const fin = new Promise((ok) => api.once('exit', ok));
  api.kill();
  await fin;
};
const lanzarApp = async () => {
  app = await electron.launch({ args: [resolve(AQUI, '..')], env: { ...process.env, GULA_SERVIDOR: SERVIDOR, GULA_DATOS: datos } });
};

test.beforeAll(async () => {
  tsx(['src/db/migrar-cli.ts']);
  tsx(['src/admin/cli.ts', 'crear-local', '--nombre', 'Bar E2E', '--slug', SLUG, '--dueno', 'Dueña E2E', '--email', EMAIL, '--password', 'secreto123', '--pin', '1234']);
  tsx(['src/admin/cli.ts', 'cargar-demo', '--slug', SLUG]);
  await lanzarApi();
  datos = mkdtempSync(join(tmpdir(), 'gula-e2e-datos-'));
  await lanzarApp();
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

    // Sin impresora configurada, la comanda sale en la vista previa.
    const previa = v.getByRole('complementary', { name: 'Vista previa de impresión' });
    const comanda = previa.getByRole('figure', { name: /^Comanda .* · Pedido 1$/ });
    await expect(comanda).toBeVisible();
    await expect(comanda).toContainText('Mesa 3');
    await expect(comanda).toContainText(`2x ${producto.nombre}`);
    await v.getByRole('button', { name: 'Imprimir cuenta' }).click();
    await expect(previa.getByRole('figure', { name: 'Cuenta Mesa 3' })).toContainText('Documento no válido como factura');

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

test('caja: se abre, se cobra la Mesa 3 en efectivo y se cierra contando lo esperado', async () => {
  const v = await app.firstWindow();
  const previa = v.getByRole('complementary', { name: 'Vista previa de impresión' });
  if (await previa.isVisible()) await previa.getByRole('button', { name: 'Cerrar' }).click();
  const menu = v.getByRole('navigation', { name: 'Secciones' });

  await menu.getByRole('button', { name: 'Caja' }).click();
  await v.getByLabel('Fondo de cambio').fill('10.000');
  await v.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(v.getByText(/Efectivo esperado \$ 10\.000/)).toBeVisible();

  await menu.getByRole('button', { name: 'Mesas' }).click();
  await v.getByRole('button', { name: /^Mesa 3 / }).click();
  await v.getByRole('button', { name: 'Cobrar', exact: true }).click();
  const cobro = v.getByRole('dialog', { name: 'Cobrar Mesa 3' });
  await cobro.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(cobro).toBeHidden();
  await expect(v.getByRole('button', { name: /^Mesa 3 / })).toContainText('Libre');

  await menu.getByRole('button', { name: 'Caja' }).click();
  const esperado = (await v.getByText(/Efectivo esperado/).textContent())!.replace(/.*\$\s*/, '').trim();
  await v.getByRole('button', { name: 'Cerrar caja' }).click();
  await v.getByLabel('Efectivo contado').fill(esperado);
  await expect(v.getByText('Da justo')).toBeVisible();
  await v.getByRole('button', { name: 'Confirmar cierre' }).click();
  await expect(v.getByRole('button', { name: 'Abrir caja' })).toBeVisible();
  await expect(previa.getByRole('figure', { name: /^Cierre de caja/ })).toContainText('Efectivo contado');

  const sql = await base();
  try {
    await expect
      .poll(
        async () =>
          (
            await sql`select t.diferencia, t.cerrado_en is not null as cerrada from turnos_caja t join locales l on l.id = t.local_id where l.slug = ${SLUG}`
          ).map((f) => `${f.diferencia}:${f.cerrada}`),
        { timeout: 20_000 },
      )
      .toEqual(['0:true']);
    const estados = await sql`select p.estado from pedidos p join locales l on l.id = p.local_id where l.slug = ${SLUG}`;
    expect(estados.map((f) => f.estado)).toEqual(['cobrado']);
  } finally {
    await sql.end();
  }
});

test('delivery: se carga, sale, se cobra con el envío al entregar y el servidor lo ve entregado', async () => {
  const v = await app.firstWindow();
  const previa = v.getByRole('complementary', { name: 'Vista previa de impresión' });
  if (await previa.isVisible()) await previa.getByRole('button', { name: 'Cerrar' }).click();
  const menu = v.getByRole('navigation', { name: 'Secciones' });

  await menu.getByRole('button', { name: 'Caja' }).click();
  await v.getByLabel('Fondo de cambio').fill('0');
  await v.getByRole('button', { name: 'Abrir caja' }).click();
  await expect(v.getByText(/Efectivo esperado/)).toBeVisible();

  await menu.getByRole('button', { name: 'Delivery' }).click();
  await v.getByRole('button', { name: 'Nuevo delivery' }).click();
  await v.getByLabel('Teléfono').fill('1155551234');
  await v.getByLabel('Nombre').fill('Juana');
  await v.getByLabel('Dirección').fill('Av. Siempreviva 742');
  await v.getByLabel('Envío').fill('1.500');
  await v.getByRole('button', { name: 'Elegir productos' }).click();
  await v.getByLabel('Buscar producto').fill('Tostado');
  await v.getByRole('button', { name: /Tostado de jamón y queso/ }).click();
  await v.getByRole('dialog', { name: 'Tostado de jamón y queso' }).getByRole('button', { name: /Agregar/ }).click();
  await v.getByRole('button', { name: 'Enviar a cocina' }).click();
  await expect(v.getByRole('status').filter({ hasText: /Delivery \d+ cargado/ })).toBeVisible();
  await expect(previa.getByRole('figure', { name: /^Delivery · Pedido/ })).toContainText('Av. Siempreviva 742');

  const tarjeta = v.getByRole('article', { name: /Juana/ });
  await tarjeta.getByRole('button', { name: 'Salió' }).click();
  await v.getByLabel('Repartidor').fill('Juan');
  await v.getByRole('button', { name: 'Confirmar salida' }).click();
  await expect(v.getByRole('region', { name: 'En camino' }).getByRole('article', { name: /Juana/ })).toBeVisible();

  await tarjeta.getByRole('button', { name: 'Entregado' }).click();
  const cobro = v.getByRole('dialog', { name: /^Cobrar delivery/ });
  await expect(cobro).toContainText('Subtotal $ 9.300');
  await cobro.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(v.getByRole('region', { name: 'Entregados hoy' }).getByRole('article', { name: /Juana/ })).toContainText('Cobrado');

  const sql = await base();
  try {
    await expect
      .poll(
        async () =>
          (
            await sql`select p.estado, d.estado as reparto, d.repartidor from pedidos p join deliveries d on d.id = p.id
                      join locales l on l.id = p.local_id where l.slug = ${SLUG}`
          ).map((f) => `${f.estado}:${f.reparto}:${f.repartidor}`),
        { timeout: 20_000 },
      )
      .toEqual(['cobrado:entregado:Juan']);
  } finally {
    await sql.end();
  }
});

test('reportes: el mes muestra lo cobrado en salón y delivery', async () => {
  const v = await app.firstWindow();
  const menu = v.getByRole('navigation', { name: 'Secciones' });
  const sql = await base();
  let total: number;
  try {
    const [f] = await sql`select coalesce(sum(c.total), 0)::bigint as total from cobros c join locales l on l.id = c.local_id where l.slug = ${SLUG}`;
    total = Number(f!.total);
  } finally {
    await sql.end();
  }
  expect(total).toBeGreaterThan(0);

  await menu.getByRole('button', { name: 'Reportes' }).click();
  const ventas = v.getByRole('group', { name: 'Ventas' });
  await expect(ventas).toContainText(formatearPrecio(total), { timeout: 20_000 });
  const origen = v.getByRole('table', { name: 'Por origen' });
  await expect(origen).toContainText('Salón');
  await expect(origen).toContainText('Delivery');
  await expect(v.getByRole('group', { name: 'Resultado' })).toBeVisible();
});

test('sin conexión y con la PC reiniciada: se cobra la Mesa 5, se entra con PIN y al volver la API todo llega', async () => {
  test.setTimeout(240_000);
  let v = await app.firstWindow();
  const previa = v.getByRole('complementary', { name: 'Vista previa de impresión' });
  if (await previa.isVisible()) await previa.getByRole('button', { name: 'Cerrar' }).click();

  await matarApi();
  await expect(v.getByRole('status').filter({ hasText: /Sin conexión/ })).toBeVisible({ timeout: 90_000 });

  // La caja quedó abierta en la prueba de delivery: se abre la mesa, se pide y se cobra sin red.
  const menu = v.getByRole('navigation', { name: 'Secciones' });
  await menu.getByRole('button', { name: 'Mesas' }).click();
  await v.getByRole('button', { name: /^Mesa 5 / }).click();
  await v.getByRole('dialog', { name: 'Abrir Mesa 5' }).getByRole('button', { name: 'Abrir mesa' }).click();
  await v.getByRole('button', { name: 'Nuevo pedido' }).click();
  await v.getByLabel('Buscar producto').fill('Tostado');
  await v.getByRole('button', { name: /Tostado de jamón y queso/ }).click();
  await v.getByRole('dialog', { name: 'Tostado de jamón y queso' }).getByRole('button', { name: /Agregar/ }).click();
  await v.getByRole('button', { name: 'Enviar a cocina' }).click();
  await v.getByRole('button', { name: 'Cobrar', exact: true }).click();
  const cobro = v.getByRole('dialog', { name: 'Cobrar Mesa 5' });
  await cobro.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(cobro).toBeHidden();
  await expect(v.getByRole('button', { name: /^Mesa 5 / })).toContainText('Libre');

  // Se corta la luz: Electron se cierra y vuelve a abrir sin API.
  await app.close();
  await lanzarApp();
  v = await app.firstWindow();
  await v.getByRole('button', { name: /Dueña E2E/ }).click({ timeout: 30_000 });
  for (const d of ['1', '2', '3', '4']) await v.getByRole('button', { name: d, exact: true }).click();
  await v.getByRole('button', { name: 'Entrar' }).click();
  await expect(v.getByRole('status').filter({ hasText: /cambios? pendientes?/ })).toBeVisible({ timeout: 30_000 });
  await expect(v.getByRole('button', { name: /^Mesa 5 / })).toContainText('Libre');

  // Vuelve la API: la PC sincroniza sola.
  await lanzarApi();
  await expect(v.getByRole('status').filter({ hasText: /En línea/ })).toBeVisible({ timeout: 120_000 });
  const sql = await base();
  try {
    await expect
      .poll(
        async () =>
          (
            await sql`select p.estado from pedidos p join sesiones_mesa s on s.id = p.sesion_id join mesas m on m.id = s.mesa_id
                      join locales l on l.id = p.local_id
                      where l.slug = ${SLUG} and m.nombre = 'Mesa 5'`
          ).map((f) => f.estado),
        { timeout: 30_000 },
      )
      .toEqual(['cobrado']);
  } finally {
    await sql.end();
  }
});
