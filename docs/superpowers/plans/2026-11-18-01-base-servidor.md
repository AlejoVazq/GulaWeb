# Fase 1 — Base del servidor: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listo el monorepo y una API multi-local con autenticación de dispositivo, cambio de usuario por PIN, permisos por rol, auditoría y aislamiento por local en Postgres, desplegable en el VPS con Docker + Caddy.

**Architecture:** Monorepo pnpm + Turborepo. `packages/shared` tiene las reglas puras (ids, roles, matriz de permisos) que después reusan la carta y la app de PC. `apps/api` es Fastify + Drizzle sobre PostgreSQL con dos conexiones: `dbAdmin` (dueño de las tablas, solo para migraciones, CLI y búsqueda de login por email) y `dbApp` (rol `gula_app`, sujeto a Row-Level Security por `app.local_id`).

**Tech Stack:** Node 24 LTS, pnpm 10, TypeScript (strict, ESM), Turborepo, Vitest, Fastify 5, Drizzle ORM + drizzle-kit, PostgreSQL 17, Zod, `jose` (JWT), `@node-rs/argon2`, `@fastify/rate-limit`, `uuid` (v7), pino, Docker Compose, Caddy 2, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-18-gulaweb-design.md` (secciones 5, 7, 8, 10, 13, 15). Hoja de ruta: `docs/superpowers/plans/2026-11-18-00-hoja-de-ruta.md`.

## Global Constraints

- Node `24` (`.nvmrc`), pnpm `10`, `"type": "module"`, TypeScript `strict: true`. Paquetes con nombre `@gula/<nombre>`.
- Todo ID es UUIDv7 generado con `nuevoId()` de `@gula/shared` (también en el cliente).
- Toda tabla de negocio tiene `local_id uuid not null` y política RLS `aislamiento_local`; la API nunca consulta tablas de negocio con `dbAdmin` salvo en login, CLI y migraciones.
- Fechas `timestamptz` en UTC; la zona `America/Argentina/Buenos_Aires` se aplica solo al presentar/reportar.
- Dinero (desde fase 2): enteros en centavos, nunca float.
- Errores HTTP con cuerpo `{ "error": { "codigo": "UPPER_SNAKE", "mensaje": "texto en español rioplatense" } }`.
- Identificadores de código y tablas en español sin tildes (`dueno`, `dispositivos`).
- Secretos solo por variables de entorno; `.env` nunca se commitea (`.env.example` sí).
- Contraseñas y PIN con Argon2id; tokens de refresh guardados como hash SHA-256.

## Review Focus

1. **Fuerza bruta de PIN en la PC compartida** → tras 5 PIN erróneos, ese usuario queda bloqueado 5 minutos (423 `PIN_BLOQUEADO`), incluso con el PIN correcto. → test en Task 8.
2. **Refresh token robado y reusado** → reusar un refresh ya usado revoca toda la familia; el token "nuevo" del atacante o del legítimo deja de servir. → test en Task 7.
3. **Usuario dado de baja con token vigente** → la siguiente request con su access token falla con 401, sin esperar los 15 min. → test en Task 7.
4. **Acceso cruzado entre locales con ID válido** → `PATCH /usuarios/:id` con un id de otro local responde 404, nunca lo modifica. → test en Task 9.
5. **Email con mayúsculas/espacios** → `" Dueno@Local.com "` y `"dueno@local.com"` son el mismo usuario al crear y al loguear. → test en Task 5 y Task 6.

---

## Estructura de archivos

```
.nvmrc · .editorconfig · .gitignore · .prettierrc · eslint.config.js
package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json
packages/shared/
  package.json · tsconfig.json
  src/index.ts · src/ids.ts · src/ids.test.ts
  src/roles.ts · src/permisos.ts · src/permisos.test.ts
apps/api/
  package.json · tsconfig.json · vitest.config.ts · drizzle.config.ts
  src/config.ts                 # env validado con Zod
  src/app.ts                    # buildApp(config) → FastifyInstance
  src/server.ts                 # entrypoint
  src/errores.ts                # ErrorApi + handler
  src/db/cliente.ts             # dbAdmin, dbApp
  src/db/conLocal.ts            # transacción con app.local_id
  src/db/schema/{locales,usuarios,dispositivos,auth,auditoria,index}.ts
  src/db/migraciones/           # drizzle-kit + 0001_rls.sql manual
  src/seguridad/hash.ts         # argon2 + sha256
  src/seguridad/tokens.ts       # JWT access + refresh opaco
  src/locales/crearLocal.ts
  src/admin/cli.ts
  src/auth/{plugin.ts,rutas.ts,servicio.ts}
  src/permisos/requierePermiso.ts
  src/auditoria/registrar.ts
  src/usuarios/rutas.ts
  test/{globalSetup.ts,helpers.ts}
  test/*.test.ts
infra/
  compose.dev.yml · compose.prod.yml · Caddyfile · api.Dockerfile
  initdb/01-roles.sql · backup/backup.sh · .env.example · README.md
.github/workflows/ci.yml
```

---

### Task 1: Monorepo y generador de IDs

**Files:**
- Create: archivos raíz listados arriba, `packages/shared/{package.json,tsconfig.json,src/index.ts,src/ids.ts}`
- Test: `packages/shared/src/ids.test.ts`

**Interfaces:**
- Produces: `nuevoId(): string`, `esId(valor: unknown): valor is string` exportados desde `@gula/shared`. Scripts raíz `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (vía turbo).

- [ ] **Step 1: Crear configuración raíz** — workspace `apps/*` y `packages/*`; turbo con tareas `build`, `test`, `lint`, `typecheck`; `tsconfig.base.json` con `strict`, `module: NodeNext`, `target: ES2023`; ESLint flat config con `typescript-eslint`; `.gitignore` con `node_modules`, `dist`, `.env`, `.turbo`, `coverage`.
- [ ] **Step 2: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { nuevoId, esId } from './ids';

describe('ids', () => {
  it('genera UUIDv7 válidos y ordenables por tiempo', () => {
    const a = nuevoId();
    const b = nuevoId();
    expect(esId(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(a < b).toBe(true);
  });
  it('esId rechaza valores que no son UUID', () => {
    expect(esId('hola')).toBe(false);
    expect(esId(123)).toBe(false);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla** — `pnpm --filter @gula/shared test` → FAIL (módulo `./ids` no existe).
- [ ] **Step 4: Implementar `ids.ts`** con `v7` y `validate` del paquete `uuid` (monotónico dentro del mismo ms). Reexportar en `index.ts`.
- [ ] **Step 5: Verificar** — `pnpm test && pnpm lint && pnpm typecheck` → todo PASS.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: monorepo base y generador de ids"`

---

### Task 2: Roles y matriz de permisos

**Files:**
- Create: `packages/shared/src/roles.ts`, `packages/shared/src/permisos.ts`
- Test: `packages/shared/src/permisos.test.ts`

**Interfaces:**
- Produces:
  - `type Rol = 'dueno' | 'encargado' | 'mesero'`, `ROLES: readonly Rol[]`
  - `ACCIONES` (readonly tuple) y `type Accion = typeof ACCIONES[number]`
  - `type Permiso = 'si' | 'no' | 'con_autorizacion'`
  - `puede(rol: Rol, accion: Accion): Permiso`

Matriz (spec §10, fija):

| Accion | mesero | encargado | dueno |
|---|---|---|---|
| `mesa.operar` (abrir/cerrar) | si | si | si |
| `pedido.tomar` | si | si | si |
| `pedido.confirmar` | si | si | si |
| `pedido.ver` | si | si | si |
| `comanda.imprimir` | si | si | si |
| `delivery.gestionar` | si | si | si |
| `carta.disponibilidad` | si | si | si |
| `cobro.registrar` | no | si | si |
| `pedido.anular` | con_autorizacion | si | si |
| `pedido.descuento` | con_autorizacion | si | si |
| `caja.operar` | no | si | si |
| `carta.editar` | no | si | si |
| `reportes.ver` | no | si | si |
| `reportes.resultado` | no | no | si |
| `admin.configurar` | no | no | si |

- [ ] **Step 1: Escribir el test que falla**

```ts
import { it, expect } from 'vitest';
import { puede, ACCIONES } from './permisos';

it('mesero', () => {
  expect(puede('mesero', 'pedido.tomar')).toBe('si');
  expect(puede('mesero', 'pedido.confirmar')).toBe('si');
  expect(puede('mesero', 'carta.disponibilidad')).toBe('si');
  expect(puede('mesero', 'cobro.registrar')).toBe('no');
  expect(puede('mesero', 'carta.editar')).toBe('no');
  expect(puede('mesero', 'pedido.anular')).toBe('con_autorizacion');
});
it('encargado', () => {
  expect(puede('encargado', 'caja.operar')).toBe('si');
  expect(puede('encargado', 'reportes.ver')).toBe('si');
  expect(puede('encargado', 'reportes.resultado')).toBe('no');
  expect(puede('encargado', 'admin.configurar')).toBe('no');
});
it('dueño puede todo', () => {
  for (const a of ACCIONES) expect(puede('dueno', a)).toBe('si');
});
it('ACCIONES tiene exactamente 15 acciones', () => {
  expect(ACCIONES).toHaveLength(15);
});
```

- [ ] **Step 2: Correr y verificar que falla** — `pnpm --filter @gula/shared test` → FAIL.
- [ ] **Step 3: Implementar** la matriz como `Record<Accion, Record<Rol, Permiso>>` con `satisfies` para que TypeScript exija cada celda.
- [ ] **Step 4: Verificar** — `pnpm --filter @gula/shared test` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(shared): roles y matriz de permisos"` (agregar archivos nuevos con `git add`).

---

### Task 3: Esqueleto de la API

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,vitest.config.ts}`, `src/config.ts`, `src/errores.ts`, `src/app.ts`, `src/server.ts`
- Test: `apps/api/test/salud.test.ts`

**Interfaces:**
- Produces:
  - `type Config = { nodeEnv: 'development'|'test'|'production'; port: number; databaseUrl: string; databaseAdminUrl: string; jwtSecret: string; rateLimitAuth: number }`
  - `cargarConfig(env: NodeJS.ProcessEnv): Config` — env: `NODE_ENV`, `PORT` (default `3000`), `DATABASE_URL`, `DATABASE_ADMIN_URL`, `JWT_SECRET` (mínimo 32 caracteres), `RATE_LIMIT_AUTH` (default `10`; los tests lo suben salvo en el test de rate limit). Falla con mensaje claro si falta algo.
  - `class ErrorApi extends Error { constructor(status: number, codigo: string, mensaje: string) }`
  - `buildApp(config: Config): Promise<FastifyInstance>` — logger pino (silencioso en test), handler que convierte `ErrorApi` y errores de validación Zod (400 `DATOS_INVALIDOS`) al formato global; 404 `NO_ENCONTRADO`.
  - `GET /salud` → `200 { ok: true }`

- [ ] **Step 1: Escribir el test que falla**

```ts
it('GET /salud responde ok', async () => {
  const app = await buildApp(configDePrueba());
  const r = await app.inject({ method: 'GET', url: '/salud' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toEqual({ ok: true });
});
it('ruta inexistente usa el formato de error', async () => {
  const app = await buildApp(configDePrueba());
  const r = await app.inject({ method: 'GET', url: '/nada' });
  expect(r.statusCode).toBe(404);
  expect(r.json().error.codigo).toBe('NO_ENCONTRADO');
});
it('cargarConfig rechaza JWT_SECRET corto', () => {
  expect(() => cargarConfig({ ...envValido, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
});
```

(`configDePrueba()` y `envValido` viven en `test/helpers.ts`.)

- [ ] **Step 2: Correr y verificar que falla** — `pnpm --filter @gula/api test` → FAIL.
- [ ] **Step 3: Implementar** config, errores, app y server (`server.ts` llama `buildApp(cargarConfig(process.env))` y escucha en `0.0.0.0`).
- [ ] **Step 4: Verificar** — `pnpm --filter @gula/api test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): esqueleto fastify con salud y errores"`

---

### Task 4: Base de datos, esquema y aislamiento RLS

**Files:**
- Create: `infra/compose.dev.yml`, `infra/initdb/01-roles.sql`, `apps/api/drizzle.config.ts`, `src/db/cliente.ts`, `src/db/conLocal.ts`, `src/db/schema/*.ts`, `src/db/migraciones/*`, `test/globalSetup.ts`
- Modify: `apps/api/vitest.config.ts` (globalSetup), `test/helpers.ts`
- Test: `apps/api/test/rls.test.ts`

**Interfaces:**
- Produces:
  - Tablas (Drizzle, columnas en snake_case):
    - `locales(id uuid pk, nombre text, slug text unique, marca jsonb default '{}', config jsonb default '{}', creado_en timestamptz default now())`
    - `usuarios(id, local_id → locales, nombre, rol text check in ('dueno','encargado','mesero'), email text null unique, password_hash text null, pin_hash text not null, pin_fallos int default 0, pin_bloqueado_hasta timestamptz null, activo bool default true, creado_en)`
    - `dispositivos(id, local_id, nombre, activo bool default true, creado_en, ultimo_uso timestamptz)`
    - `refresh_tokens(id, local_id, dispositivo_id → dispositivos, usuario_id → usuarios, familia uuid, hash text unique, usado_en timestamptz null, revocado bool default false, expira_en timestamptz)`
    - `auditoria(id, local_id, usuario_id, autorizado_por uuid null, accion text, entidad text, entidad_id uuid null, antes jsonb null, despues jsonb null, creado_en)`
  - `dbAdmin`, `dbApp` (instancias Drizzle sobre `postgres`/`pg` con `databaseAdminUrl` y `databaseUrl`), creadas por `crearDb(config)`.
  - `conLocal<T>(db: DbApp, localId: string, fn: (tx) => Promise<T>): Promise<T>` — abre transacción y ejecuta `select set_config('app.local_id', $1, true)` antes de `fn`.
  - Helper de test `crearLocalDePrueba(slug: string): Promise<{ localId: string; duenoId: string }>` (inserta con `dbAdmin`), y `limpiarDb()` (TRUNCATE ... CASCADE entre tests).

- [ ] **Step 1: Docker de desarrollo** — `compose.dev.yml` con `postgres:17` en puerto `5432`, bases `gula_dev` y `gula_test`, montando `initdb/`. `01-roles.sql` crea el rol `gula_app` con login (contraseña de dev `gula_app`) sin `BYPASSRLS`. Levantar: `docker compose -f infra/compose.dev.yml up -d`.
- [ ] **Step 2: Escribir el test que falla**

```ts
it('un local solo ve sus usuarios', async () => {
  const a = await crearLocalDePrueba('local-a');
  await crearLocalDePrueba('local-b');
  const filas = await conLocal(dbApp, a.localId, (tx) => tx.select().from(usuarios));
  expect(filas.map((f) => f.localId)).toEqual([a.localId]);
});
it('sin app.local_id no se ve nada', async () => {
  await crearLocalDePrueba('local-a');
  expect(await dbApp.select().from(usuarios)).toEqual([]);
});
it('no se puede insertar en otro local', async () => {
  const a = await crearLocalDePrueba('local-a');
  const b = await crearLocalDePrueba('local-b');
  await expect(
    conLocal(dbApp, a.localId, (tx) =>
      tx.insert(dispositivos).values({ id: nuevoId(), localId: b.localId, nombre: 'PC' }))
  ).rejects.toThrow(/row-level security/);
});
```

- [ ] **Step 3: Correr y verificar que falla** — `pnpm --filter @gula/api test rls` → FAIL.
- [ ] **Step 4: Esquema y migraciones** — definir tablas, `pnpm --filter @gula/api drizzle-kit generate`, y agregar migración manual `0001_rls.sql`:

```sql
-- para cada tabla t en (usuarios, dispositivos, refresh_tokens, auditoria):
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_local ON t
  USING (local_id = nullif(current_setting('app.local_id', true), '')::uuid)
  WITH CHECK (local_id = nullif(current_setting('app.local_id', true), '')::uuid);
-- locales: misma política usando la columna id
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gula_app;
```

  `globalSetup.ts` aplica migraciones a `gula_test` con `dbAdmin`. Script `pnpm --filter @gula/api db:migrar`.
- [ ] **Step 5: Implementar `cliente.ts` y `conLocal.ts`**.
- [ ] **Step 6: Verificar** — `pnpm --filter @gula/api test` → PASS (incluye Task 3).
- [ ] **Step 7: Commit** — `git commit -m "feat(api): esquema base multi-local con RLS"`

---

### Task 5: Alta de local por CLI

**Files:**
- Create: `src/seguridad/hash.ts`, `src/locales/crearLocal.ts`, `src/admin/cli.ts`
- Modify: `apps/api/package.json` (script `admin`)
- Test: `apps/api/test/crearLocal.test.ts`

**Interfaces:**
- Produces:
  - `hashear(secreto: string): Promise<string>`, `verificarHash(hash: string, secreto: string): Promise<boolean>` (Argon2id), `sha256(texto: string): string`
  - `crearLocal(db: DbAdmin, datos: { nombre: string; slug: string; dueno: { nombre: string; email: string; password: string; pin: string } }): Promise<{ localId: string; duenoId: string }>` — valida con Zod: slug `^[a-z0-9]+(-[a-z0-9]+)*$` de 3 a 40 caracteres; email normalizado `trim().toLowerCase()`; password mínimo 8; PIN `^\d{4,6}$`. Errores `ErrorApi` 409 `SLUG_EN_USO` / `EMAIL_EN_USO`, 400 `DATOS_INVALIDOS`.
  - CLI: `pnpm --filter @gula/api admin crear-local --nombre "<n>" --slug <s> --dueno "<nombre>" --email <e> --password <p> --pin <pin>` (con `node:util` `parseArgs`), imprime el `localId`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('crea local y dueño con secretos hasheados', async () => {
  const r = await crearLocal(dbAdmin, datosValidos({ slug: 'la-gula', email: ' Dueno@Local.com ' }));
  const [u] = await dbAdmin.select().from(usuarios).where(eq(usuarios.id, r.duenoId));
  expect(u.rol).toBe('dueno');
  expect(u.email).toBe('dueno@local.com');
  expect(u.passwordHash).not.toContain('secreto123');
  expect(await verificarHash(u.pinHash, '1234')).toBe(true);
});
it('rechaza slug inválido', async () => {
  await expect(crearLocal(dbAdmin, datosValidos({ slug: 'Mi Local' })))
    .rejects.toMatchObject({ codigo: 'DATOS_INVALIDOS' });
});
it('rechaza slug repetido', async () => {
  await crearLocal(dbAdmin, datosValidos({ slug: 'la-gula' }));
  await expect(crearLocal(dbAdmin, datosValidos({ slug: 'la-gula', email: 'otro@x.com' })))
    .rejects.toMatchObject({ codigo: 'SLUG_EN_USO' });
});
it('rechaza email repetido aunque cambie mayúsculas', async () => {
  await crearLocal(dbAdmin, datosValidos({ slug: 'uno', email: 'a@x.com' }));
  await expect(crearLocal(dbAdmin, datosValidos({ slug: 'dos', email: 'A@X.com' })))
    .rejects.toMatchObject({ codigo: 'EMAIL_EN_USO' });
});
```

- [ ] **Step 2: Correr y verificar que falla** — FAIL.
- [ ] **Step 3: Implementar** hash, `crearLocal` (en una transacción) y CLI.
- [ ] **Step 4: Verificar** — tests PASS; y manual: `pnpm --filter @gula/api admin crear-local --nombre "Prueba" --slug prueba --dueno "Ale" --email a@a.com --password secreto123 --pin 1234` contra `gula_dev` imprime un UUID.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): alta de local por CLI"`

---

### Task 6: Login de dispositivo

**Files:**
- Create: `src/seguridad/tokens.ts`, `src/auth/servicio.ts`, `src/auth/rutas.ts`
- Modify: `src/app.ts` (registrar rate-limit y rutas de auth)
- Test: `apps/api/test/login.test.ts`

**Interfaces:**
- Produces:
  - `firmarAcceso(claims: { sub: string; loc: string; dev: string; rol: Rol }, secreto: string): Promise<string>` (HS256, expira en **15 min**), `verificarAcceso(token: string, secreto: string): Promise<Claims>`
  - `emitirRefresh(db, { localId, dispositivoId, usuarioId, familia? }): Promise<string>` — token opaco de 32 bytes aleatorios en base64url, guarda `sha256`, expira en **30 días**; `familia` nueva si no se pasa.
  - `POST /auth/login` body `{ email, password, dispositivo: { nombre } }` → `200 { accessToken, refreshToken, dispositivoId, usuario: { id, nombre, rol }, local: { id, nombre, slug } }`.
    - Solo `dueno` y `encargado` (usuarios con `password_hash`) pueden loguear un dispositivo.
    - Al loguear, todos los demás dispositivos activos del local pasan a `activo=false` y sus refresh se revocan (spec §11: un único dispositivo activo).
    - Credenciales malas o email inexistente → 401 `CREDENCIALES_INVALIDAS` con el mismo cuerpo exacto.
  - Rate limit en `/auth/*`: **10 requests por minuto por IP** → 429 `DEMASIADOS_INTENTOS`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('login exitoso devuelve tokens y datos', async () => {
  const r = await login(app, { email: 'dueno@local.com', password: 'secreto123' });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ usuario: { rol: 'dueno' }, local: { slug: 'local-a' } });
});
it('acepta email con mayúsculas y espacios', async () => {
  expect((await login(app, { email: ' DUENO@local.com', password: 'secreto123' })).statusCode).toBe(200);
});
it('password mala y email inexistente responden igual', async () => {
  const a = await login(app, { email: 'dueno@local.com', password: 'mal' });
  const b = await login(app, { email: 'nadie@local.com', password: 'mal' });
  expect(a.statusCode).toBe(401);
  expect(a.json()).toEqual(b.json());
  expect(a.json().error.codigo).toBe('CREDENCIALES_INVALIDAS');
});
it('un segundo login desactiva el dispositivo anterior', async () => {
  const primero = (await login(app, credenciales)).json();
  await login(app, credenciales);
  const r = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: primero.refreshToken } });
  expect(r.statusCode).toBe(401);
});
it('limita a 10 intentos por minuto', async () => {
  for (let i = 0; i < 10; i++) await login(app, { email: 'x@x.com', password: 'mal' });
  expect((await login(app, { email: 'x@x.com', password: 'mal' })).statusCode).toBe(429);
});
```

(`/auth/refresh` se implementa en Task 7; este test queda en rojo hasta entonces solo en el caso del segundo login — implementar ambos en orden y correrlo al cerrar Task 7.)

- [ ] **Step 2: Correr y verificar que falla** — FAIL.
- [ ] **Step 3: Implementar** tokens, servicio y ruta. La búsqueda por email (y en Task 7 la búsqueda del refresh por hash) usa `dbAdmin`; todo lo demás, `conLocal(dbApp, ...)`.
- [ ] **Step 4: Verificar** — todos los tests de login PASS salvo "segundo login" (pendiente de Task 7).
- [ ] **Step 5: Commit** — `git commit -m "feat(api): login de dispositivo con rate limit"`

---

### Task 7: Sesión autenticada y refresh rotativo

**Files:**
- Create: `src/auth/plugin.ts`
- Modify: `src/auth/rutas.ts`, `src/auth/servicio.ts`
- Test: `apps/api/test/sesion.test.ts`

**Interfaces:**
- Consumes: `verificarAcceso`, `emitirRefresh` (Task 6).
- Produces:
  - Decorador `app.autenticar` (preHandler): valida `Authorization: Bearer`, y en cada request verifica en la DB que el dispositivo y el usuario sigan `activo`; si no, 401 `SESION_INVALIDA`. Deja `request.sesion: { usuarioId: string; localId: string; dispositivoId: string; rol: Rol }`. Actualiza `dispositivos.ultimo_uso`.
  - `GET /auth/yo` (autenticada) → `200 { usuario: { id, nombre, rol }, local: { id, nombre, slug } }`.
  - `POST /auth/refresh` `{ refreshToken }` → `200 { accessToken, refreshToken }` (misma familia, el anterior queda con `usado_en`). Reuso de un token ya usado → revoca toda la familia y 401 `TOKEN_REUTILIZADO`. Vencido, revocado o de dispositivo inactivo → 401 `SESION_INVALIDA`.
  - `POST /auth/logout` (autenticada) → revoca los refresh del dispositivo, lo desactiva, 204.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('/auth/yo con token válido', async () => {
  const { accessToken } = (await login(app, credenciales)).json();
  const r = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(accessToken) });
  expect(r.statusCode).toBe(200);
  expect(r.json().usuario.rol).toBe('dueno');
});
it('sin token responde 401', async () => {
  expect((await app.inject({ method: 'GET', url: '/auth/yo' })).statusCode).toBe(401);
});
it('usuario desactivado pierde acceso en la siguiente request', async () => {
  const { accessToken, usuario } = (await login(app, credenciales)).json();
  await dbAdmin.update(usuarios).set({ activo: false }).where(eq(usuarios.id, usuario.id));
  const r = await app.inject({ method: 'GET', url: '/auth/yo', headers: bearer(accessToken) });
  expect(r.statusCode).toBe(401);
});
it('refresh rota el token', async () => {
  const t0 = (await login(app, credenciales)).json().refreshToken;
  const r1 = await refresh(app, t0);
  expect(r1.statusCode).toBe(200);
  expect(r1.json().refreshToken).not.toBe(t0);
});
it('reusar un refresh revoca toda la familia', async () => {
  const t0 = (await login(app, credenciales)).json().refreshToken;
  const t1 = (await refresh(app, t0)).json().refreshToken;
  const reuso = await refresh(app, t0);
  expect(reuso.json().error.codigo).toBe('TOKEN_REUTILIZADO');
  expect((await refresh(app, t1)).statusCode).toBe(401);
});
```

- [ ] **Step 2: Correr y verificar que falla** — FAIL.
- [ ] **Step 3: Implementar** plugin, refresh (en transacción con `SELECT ... FOR UPDATE` sobre el token) y logout.
- [ ] **Step 4: Verificar** — `pnpm --filter @gula/api test` → PASS, incluido "segundo login desactiva el anterior" de Task 6.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): sesión autenticada y refresh rotativo"`

---

### Task 8: Cambio de usuario por PIN

**Files:**
- Modify: `src/auth/rutas.ts`, `src/auth/servicio.ts`
- Test: `apps/api/test/pin.test.ts`

**Interfaces:**
- Consumes: `app.autenticar` (Task 7).
- Produces:
  - `GET /auth/usuarios` (autenticada) → `200 [{ id, nombre, rol }]`, solo activos del local, ordenados por nombre.
  - `POST /auth/pin` (autenticada) `{ usuarioId, pin }` → `200 { accessToken, usuario: { id, nombre, rol } }`, token para ese usuario en el mismo dispositivo.
    - PIN incorrecto → 401 `PIN_INCORRECTO` e incrementa `pin_fallos`.
    - Al 5.º fallo, `pin_bloqueado_hasta = now() + 5 minutos`; mientras dure → 423 `PIN_BLOQUEADO` aunque el PIN sea correcto.
    - Éxito → `pin_fallos = 0`.
    - `usuarioId` de otro local o inactivo → 404 `NO_ENCONTRADO`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('lista usuarios activos del local', async () => {
  const r = await app.inject({ method: 'GET', url: '/auth/usuarios', headers: bearer(token) });
  expect(r.json().map((u) => u.nombre)).toEqual(['Dueño', 'Moza Ana']);
});
it('PIN correcto entrega token del otro usuario', async () => {
  const r = await pin(app, token, { usuarioId: mozaId, pin: '4321' });
  expect(r.statusCode).toBe(200);
  expect(r.json().usuario.rol).toBe('mesero');
});
it('5 PIN erróneos bloquean 5 minutos, incluso con el PIN correcto', async () => {
  for (let i = 0; i < 5; i++) expect((await pin(app, token, { usuarioId: mozaId, pin: '0000' })).statusCode).toBe(401);
  const r = await pin(app, token, { usuarioId: mozaId, pin: '4321' });
  expect(r.statusCode).toBe(423);
  expect(r.json().error.codigo).toBe('PIN_BLOQUEADO');
});
it('se desbloquea pasado el plazo', async () => {
  await dbAdmin.update(usuarios).set({ pinFallos: 5, pinBloqueadoHasta: new Date(Date.now() - 1000) }).where(eq(usuarios.id, mozaId));
  expect((await pin(app, token, { usuarioId: mozaId, pin: '4321' })).statusCode).toBe(200);
});
it('usuario de otro local no existe', async () => {
  expect((await pin(app, token, { usuarioId: usuarioDeOtroLocal, pin: '1234' })).statusCode).toBe(404);
});
```

(Los tests usan `configDePrueba({ rateLimitAuth: 1000 })` para que el rate limit no interfiera.)

- [ ] **Step 2: Correr y verificar que falla** — FAIL.
- [ ] **Step 3: Implementar** las dos rutas.
- [ ] **Step 4: Verificar** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): cambio de usuario por PIN con bloqueo"`

---

### Task 9: Permisos, autorización por PIN y auditoría

**Files:**
- Create: `src/permisos/requierePermiso.ts`, `src/auditoria/registrar.ts`, `src/usuarios/rutas.ts`
- Modify: `src/app.ts`
- Test: `apps/api/test/permisos.test.ts`, `apps/api/test/usuarios.test.ts`

**Interfaces:**
- Consumes: `puede` (Task 2), `request.sesion` (Task 7).
- Produces:
  - `requierePermiso(accion: Accion): preHandler` — `si` → pasa; `no` → 403 `SIN_PERMISO`; `con_autorizacion` → exige headers `x-autoriza-usuario` y `x-autoriza-pin` de un usuario del mismo local con permiso `si` para esa acción y PIN válido (mismo contador de bloqueo que Task 8); si faltan o fallan → 403 `REQUIERE_AUTORIZACION`. Deja `request.autorizadoPor?: string`.
  - `registrarAuditoria(tx, { sesion, accion: string, entidad: string, entidadId?: string, antes?: unknown, despues?: unknown, autorizadoPor?: string }): Promise<void>`
  - Rutas (todas `admin.configurar`): `GET /usuarios`, `POST /usuarios` `{ nombre, rol, pin, email?, password? }` (email+password obligatorios si rol ≠ `mesero`), `PATCH /usuarios/:id` `{ nombre?, rol?, pin?, activo?, password? }`. Respuestas nunca incluyen hashes. Auditan `usuario.crear` / `usuario.editar` sin hashes en `antes`/`despues`. No se puede desactivar ni cambiar el rol del último `dueno` activo → 409 `ULTIMO_DUENO`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// permisos.test.ts — ruta registrada solo en el test:
// app.post('/_prueba/anular', { preHandler: [app.autenticar, requierePermiso('pedido.anular')] }, ok)
it('mesero sin autorización recibe 403 REQUIERE_AUTORIZACION', async () => {
  const r = await post(app, '/_prueba/anular', tokenMoza);
  expect(r.json().error.codigo).toBe('REQUIERE_AUTORIZACION');
});
it('mesero con PIN del encargado pasa y queda quién autorizó', async () => {
  const r = await post(app, '/_prueba/anular', tokenMoza, { 'x-autoriza-usuario': encargadoId, 'x-autoriza-pin': '5555' });
  expect(r.statusCode).toBe(200);
  expect(r.json().autorizadoPor).toBe(encargadoId);
});
it('un mesero no puede autorizar a otro mesero', async () => {
  const r = await post(app, '/_prueba/anular', tokenMoza, { 'x-autoriza-usuario': otraMozaId, 'x-autoriza-pin': '1111' });
  expect(r.statusCode).toBe(403);
});

// usuarios.test.ts
it('mesero no puede crear usuarios', async () => {
  expect((await crearUsuario(app, tokenMoza, mozaNueva)).json().error.codigo).toBe('SIN_PERMISO');
});
it('dueño crea mesero y queda auditado sin hashes', async () => {
  const r = await crearUsuario(app, tokenDueno, { nombre: 'Lu', rol: 'mesero', pin: '2468' });
  expect(r.statusCode).toBe(201);
  expect(r.json()).not.toHaveProperty('pinHash');
  const [a] = await dbAdmin.select().from(auditoria).where(eq(auditoria.accion, 'usuario.crear'));
  expect(JSON.stringify(a.despues)).not.toMatch(/hash/i);
});
it('PATCH a usuario de otro local responde 404 y no lo cambia', async () => {
  const r = await patchUsuario(app, tokenDueno, usuarioDeOtroLocal, { nombre: 'X' });
  expect(r.statusCode).toBe(404);
});
it('no se puede desactivar al último dueño', async () => {
  expect((await patchUsuario(app, tokenDueno, duenoId, { activo: false })).json().error.codigo).toBe('ULTIMO_DUENO');
});
```

- [ ] **Step 2: Correr y verificar que fallan** — FAIL.
- [ ] **Step 3: Implementar** middleware, auditoría y rutas de usuarios.
- [ ] **Step 4: Verificar** — `pnpm test` en todo el monorepo → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(api): permisos por rol, autorización por PIN y auditoría"`

---

### Task 10: Infraestructura de producción, backups y CI

**Files:**
- Create: `infra/api.Dockerfile`, `infra/compose.prod.yml`, `infra/Caddyfile`, `infra/.env.example`, `infra/backup/backup.sh`, `infra/README.md`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces:
  - Imagen de la API: multi-stage (build con pnpm `--filter @gula/api...` → runtime `node:24-slim`, usuario no root), corre migraciones (`db:migrar`) y luego `server.js`.
  - `compose.prod.yml`: servicios `caddy` (puertos 80/443, volúmenes `caddy_data`, `caddy_config`), `api` (sin puertos expuestos), `postgres:17` (volumen `pg_data`, `initdb/`), con `restart: unless-stopped` y healthchecks (`/salud` para la API, `pg_isready` para Postgres).
  - `Caddyfile`: `{$DOMINIO} { handle_path /api/* { reverse_proxy api:3000 } }` (la carta estática se suma en fase 2). Encabezados de seguridad básicos (HSTS, `X-Content-Type-Options`).
  - `.env.example`: `DOMINIO`, `POSTGRES_PASSWORD`, `GULA_APP_PASSWORD`, `JWT_SECRET`, `BACKUP_PASSPHRASE`, `BACKUP_RCLONE_REMOTE` (opcional).
  - `backup.sh`: `pg_dump -Fc` → `gpg --symmetric --batch --passphrase "$BACKUP_PASSPHRASE"` → `/var/backups/gula/gula-AAAAMMDD-HHMM.dump.gpg`; borra los de más de **14 días**; si `BACKUP_RCLONE_REMOTE` está definido, `rclone copy` al remoto. `README.md` documenta: preparar VPS, `.env`, `docker compose up -d`, crear local con el CLI dentro del contenedor, cron diario `0 4 * * *` del backup y cómo restaurar.
  - CI: en push/PR, Node 24 + pnpm, servicio `postgres:17`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `docker build -f infra/api.Dockerfile .`.

- [ ] **Step 1: Escribir los archivos de infraestructura.**
- [ ] **Step 2: Verificar la configuración** — `docker compose -f infra/compose.prod.yml --env-file infra/.env.example config` → sale sin errores.
- [ ] **Step 3: Prueba de humo local** — con `DOMINIO=localhost` en un `.env` local: `docker compose -f infra/compose.prod.yml up -d --build`, luego `curl -k https://localhost/api/salud` → `{"ok":true}`; y `docker compose -f infra/compose.prod.yml exec api node dist/admin/cli.js crear-local ...` imprime un UUID.
- [ ] **Step 4: Prueba de backup** — correr `infra/backup/backup.sh` contra el stack de humo → aparece el `.dump.gpg`; restaurarlo en una base vacía con `gpg -d | pg_restore` → sin errores y la tabla `locales` tiene la fila creada.
- [ ] **Step 5: Bajar el stack de humo** — `docker compose -f infra/compose.prod.yml down -v`.
- [ ] **Step 6: Commit** — `git commit -m "chore(infra): docker, caddy, backups y CI"`

---

## Cierre de fase

- [ ] `pnpm lint && pnpm typecheck && pnpm test` en la raíz → todo PASS.
- [ ] Deploy en el VPS siguiendo `infra/README.md` con el dominio de pruebas; `curl https://<dominio>/api/salud` → `{"ok":true}`.
- [ ] Actualizar la hoja de ruta (fase 1 ✔) y escribir el plan de la fase 2.
