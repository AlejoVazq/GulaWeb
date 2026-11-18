# Fase 3 — App de PC: base local-first — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App de escritorio Electron que se loguea como el dispositivo del local, cambia de usuario por PIN, guarda la carta en una base SQLite local, la mantiene sincronizada (pull + aviso por WebSocket), encola operaciones offline en una outbox idempotente y permite editar la carta y su disponibilidad.

**Architecture:** Toda la red, la base local y la sincronización viven en el **proceso main** (Node). El renderer (React) solo habla con main por un puente IPC tipado (`window.gula`). La UI siempre lee de SQLite local (local-first). Las escrituras de carta van online por REST (spec §11: carta editable solo con conexión); la disponibilidad de productos y opciones va por la **outbox** (funciona offline). El servidor avisa cambios por Socket.IO (sala por local) y el cliente responde haciendo pull.

**Tech Stack:** Electron 45, electron-vite 6, React 19, `node:sqlite` (incluido en Node/Electron, sin módulos nativos), Socket.IO 4 (server en la API, client en main), Vitest, Playwright (`_electron`) para un humo end-to-end.

**Spec:** `docs/superpowers/specs/2026-11-18-gulaweb-design.md` (§7, §10, §11, §14 App PC). Base: fases 1 y 2.

## Global Constraints

- Todas las de las fases 1 y 2.
- El renderer **no** hace `fetch` ni accede a Node: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; todo pasa por `window.gula` (preload).
- La UI nunca espera a la red para mostrar datos: lee SQLite local.
- Refresh token guardado cifrado con `safeStorage` de Electron (en tests, un cifrador inyectable).
- Una operación de outbox tiene `id` UUIDv7 generado en la PC; el servidor la aplica **una sola vez** aunque llegue varias veces.
- Pull de cambios con ventana de solapamiento de **30 s** sobre el cursor (los commits pueden llegar fuera de orden); el cliente hace upsert idempotente por `id` con "gana el `actualizadoEn` más nuevo".
- Estética mínima funcional (fase 10 hace el diseño). Textos en español rioplatense.

## Review Focus

1. **Se corta internet a mitad de un envío de la outbox** → al volver, la misma operación se reenvía y el servidor responde con el resultado guardado; la disponibilidad queda aplicada una vez y la auditoría tiene una sola fila. → test en Task 3 y Task 7.
2. **Access token vencido mientras hay varias requests en vuelo** → un único refresh (single-flight); las demás esperan y se reintentan con el token nuevo; nunca dos refresh en paralelo. → test en Task 6.
3. **Cambio hecho en el servidor durante el corte** → al reconectar el pull trae lo cambiado (incluido lo borrado lógicamente) y la carta local queda igual a la del servidor. → test en Task 7.
4. **Cambio local más viejo que el del servidor** (`actualizadoEn` menor) → el upsert local no pisa el dato nuevo. → test en Task 5.
5. **La app se cierra con operaciones pendientes** → al abrir, la outbox sigue ahí y se envía. → test en Task 5 (persistencia en archivo) y Task 7.

---

## Estructura de archivos

```
apps/api/src/tiempoReal/{socket.ts,avisar.ts}          # Socket.IO + avisos por local
apps/api/src/sync/{rutas.ts,operaciones.ts}            # pull de carta + outbox
apps/api/src/db/schema/sync.ts                         # operaciones_aplicadas
apps/api/test/{tiempo-real,sync-pull,sync-operaciones}.test.ts
apps/desktop/
  electron.vite.config.ts · package.json · tsconfig*.json
  src/main/index.ts                  # ventana, ciclo de vida
  src/main/db/{base.ts,migraciones.ts}       # node:sqlite + migraciones locales
  src/main/db/{carta.ts,outbox.ts,kv.ts}     # repositorios
  src/main/api/{cliente.ts,sesion.ts}        # HTTP con refresh single-flight
  src/main/sync/motor.ts                     # pull / push / estado de conexión
  src/main/ipc.ts                            # handlers
  src/preload/index.ts                       # window.gula
  src/compartido/ipc.ts                      # contrato tipado main⇄renderer
  src/renderer/{index.html,main.tsx,App.tsx,estilos.css}
  src/renderer/pantallas/{Login,ElegirUsuario,Carta}.tsx
  src/renderer/componentes/{Conexion,EditorProducto}.tsx
  test/ (vitest, entorno node) · e2e/humo.spec.ts (Playwright)
```

---

### Task 1: Avisos en tiempo real (API)

**Files:** Create `apps/api/src/tiempoReal/socket.ts`, `avisar.ts` · Modify `src/app.ts`, rutas de carta (avisar tras cada mutación) · Test: `test/tiempo-real.test.ts`

**Interfaces — Produces:**
- Socket.IO montado en el mismo server Fastify, path `/tiempo-real`. Handshake `auth: { token }` (access token); se valida igual que `app.autenticar` (dispositivo y usuario activos). Token inválido → `connect_error` con `message: 'SESION_INVALIDA'`. El socket entra a la sala `local:<localId>`.
- `app.avisar(localId: string, tema: 'carta'): void` — emite `cambios` `{ tema }` a la sala. Lo llaman todas las rutas `/carta/*` que modifican datos (después del commit).
- Caddy: `/api/tiempo-real/*` llega al API por el mismo `handle_path /api/*` (websocket incluido).

- [ ] **Step 1: Tests que fallan** — (con `app.listen({ port: 0 })` y `socket.io-client`) un socket con token válido de local A recibe `cambios {tema:'carta'}` cuando el encargado crea una categoría; un socket de local B no lo recibe; token inválido → `connect_error` `SESION_INVALIDA`.
- [ ] **Step 2: FAIL** · **Step 3: Implementar** · **Step 4: PASS** · **Step 5: Commit** — `feat(api): avisos en tiempo real por local`

---

### Task 2: Pull de la carta (API)

**Files:** Create `src/sync/rutas.ts` · Test: `test/sync-pull.test.ts`

**Interfaces — Produces:**
- `GET /sync/carta?desde=<ISO|vacío>` (autenticada, permiso `pedido.ver`) → `200 { cursor: string /*ISO del servidor al inicio de la consulta*/, sectores: Fila[], categorias: Fila[], productos: Fila[], grupos: Fila[], opciones: Fila[] }`. Cada fila trae **todas** sus columnas en camelCase salvo `localId`, con `actualizadoEn` y `eliminadoEn` en ISO. `desde` vacío = todo; si no, filas con `actualizado_en > desde - 30 s`. Horarios como `HH:MM`. `foto` como `{ chica, grande } | null`.

- [ ] **Step 1: Tests que fallan** — sin `desde` trae todo, incluidos borrados lógicos con `eliminadoEn`; con `desde = cursor` de una llamada anterior trae solo lo modificado después (más el solape de 30 s); nunca trae filas de otro local; la moza puede hacer pull.
- [ ] **Step 2–5** — `feat(api): pull de carta para sincronización`

---

### Task 3: Operaciones idempotentes (API)

**Files:** Create `src/db/schema/sync.ts`, migración `0004_sync` (+RLS), `src/sync/operaciones.ts` · Modify `src/sync/rutas.ts`, `test/db.ts` · Test: `test/sync-operaciones.test.ts`

**Interfaces — Produces:**
- Tabla `operaciones_aplicadas(id uuid pk /*id de la operación del cliente*/, local_id, dispositivo_id, tipo text, resultado jsonb, aplicada_en timestamptz default now())` + RLS.
- `POST /sync/operaciones` (autenticada) `{ operaciones: { id: uuid; tipo: string; datos: unknown; creadaEn: ISO; autorizacion?: { usuarioId, pin } }[] }` (máx 100) → `200 { resultados: { id; estado: 'aplicada' | 'rechazada'; error?: { codigo; mensaje } }[] }` en el mismo orden.
  - Cada operación se aplica en su propia transacción; si su `id` ya está en `operaciones_aplicadas`, devuelve el `resultado` guardado sin volver a aplicar.
  - Los permisos se evalúan con el rol del usuario de la sesión (`puede`), igual que en REST.
  - Tipos de esta fase: `producto.disponibilidad` `{ productoId, disponible }` y `opcion.disponibilidad` `{ opcionId, disponible }` (permiso `carta.disponibilidad`; auditan como en REST; avisan `carta`).
  - Tipo desconocido o datos inválidos → `rechazada` con `DATOS_INVALIDOS` (también se guarda, para que el reintento dé lo mismo).
- `registrarTipoOperacion(tipo, { permiso, esquema, aplicar(tx, sesion, datos) })` — registro extensible que usan las fases 4–8.

- [ ] **Step 1: Tests que fallan** — enviar la misma operación dos veces → misma respuesta, una sola fila de auditoría `producto.disponibilidad`; tipo desconocido → `rechazada` y el reintento devuelve lo mismo; operación de un mesero aplica (permiso `si`); producto de otro local → `rechazada` `NO_ENCONTRADO`; lote con una válida y una inválida → la válida se aplica.
- [ ] **Step 2–5** — `feat(api): outbox idempotente del servidor`

---

### Task 4: Scaffold de la app de escritorio y base local

**Files:** Create `apps/desktop/*` (config, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/*` mínimo), `src/main/db/base.ts`, `src/main/db/migraciones.ts` · Test: `apps/desktop/test/base.test.ts`

**Interfaces — Produces:**
- `abrirBase(ruta: string): BaseLocal` (usa `DatabaseSync` de `node:sqlite`, `PRAGMA journal_mode=WAL`, `foreign_keys=ON`) y aplica migraciones locales en orden (tabla `migraciones(version)`).
- Esquema local: `kv(clave pk, valor)`, `sectores`, `categorias`, `productos`, `grupos`, `opciones` (mismas columnas que el pull, `eliminado_en` incluido, `grupos.producto_id`, `opciones.grupo_id`, etiquetas y foto como JSON), `outbox(id pk, tipo, datos json, creada_en, intentos int default 0, ultimo_error text null, estado text check in ('pendiente','rechazada'))`.
- `pnpm --filter @gula/desktop dev` abre una ventana con "GulaWeb"; `pnpm --filter @gula/desktop test` corre Vitest en Node.

- [ ] **Step 1: Test que falla** — abrir la base en un archivo temporal crea las tablas; abrirla de nuevo no re-aplica migraciones; `PRAGMA journal_mode` es `wal`.
- [ ] **Step 2–5** — `feat(desktop): scaffold electron y base local`

---

### Task 5: Repositorios locales (carta, outbox, kv)

**Files:** Create `src/main/db/{carta,outbox,kv}.ts` · Test: `test/repos.test.ts`

**Interfaces — Produces:**
- `aplicarCambiosCarta(base, cambios: RespuestaPullCarta): void` — en una transacción, upsert por `id` **solo si** `actualizadoEn` entrante ≥ el guardado.
- `leerCarta(base): CartaLocal` — `{ sectores, categorias: (Categoria & { productos: (Producto & { grupos: (Grupo & { opciones })[] })[] })[] }` sin borrados, ordenada por `orden`, `nombre`.
- `fijarDisponibilidadLocal(base, { productoId? | opcionId?, disponible })` — cambio optimista local.
- Outbox: `encolar(base, { tipo, datos }): Operacion` (id `nuevoId()`), `pendientes(base, limite = 100)`, `marcarAplicadas(base, ids)`, `marcarRechazada(base, id, error)`, `registrarFallo(base, ids, error)` (incrementa `intentos`), `contarPendientes(base)`.
- KV: `leerKv(base, clave)`, `escribirKv(base, clave, valor)` (cursor de pull, datos de sesión no secretos).

- [ ] **Step 1: Tests que fallan** — aplicar un pull dos veces deja una sola fila; una fila entrante con `actualizadoEn` viejo no pisa la nueva; un borrado lógico entrante saca el producto de `leerCarta`; encolar 3, marcar 2 aplicadas → `contarPendientes` = 1; reabrir la base desde el mismo archivo conserva la outbox.
- [ ] **Step 2–5** — `feat(desktop): repositorios locales y outbox`

---

### Task 6: Cliente de la API y sesión

**Files:** Create `src/main/api/cliente.ts`, `src/main/api/sesion.ts` · Test: `test/cliente.test.ts`

**Interfaces — Produces:**
- `type Cifrador = { cifrar(t: string): string; descifrar(t: string): string }` (prod: `safeStorage`; test: identidad).
- `crearSesion(base, cifrador)` → `{ guardar({ accessToken, refreshToken, usuario, local, dispositivoId }), actual(): SesionGuardada | null, fijarAcceso(token, usuario?), borrar() }` — el refresh se guarda cifrado en `kv`.
- `crearCliente({ urlBase, sesion, fetch })` → `{ pedir<T>(metodo, ruta, cuerpo?): Promise<T>, login(...), pin(...), subirFoto(productoId, ruta) }`.
  - Ante 401 `SESION_INVALIDA` con refresh disponible, hace **un** `POST /auth/refresh` (single-flight: llamadas concurrentes comparten la misma promesa) y reintenta una vez.
  - Refresh fallido (401) → borra la sesión y emite `sesion-cerrada`.
  - Error de red → lanza `SinConexion` (lo usa el motor de sync).
  - Errores de la API → `ErrorApi { status, codigo, mensaje }`.

- [ ] **Step 1: Tests que fallan** (con un `fetch` falso) — tres requests concurrentes con token vencido disparan un solo refresh y las tres terminan bien; refresh 401 borra la sesión y emite `sesion-cerrada`; fallo de red lanza `SinConexion`; el refresh en `kv` no está en texto plano cuando el cifrador real-falso lo transforma.
- [ ] **Step 2–5** — `feat(desktop): cliente HTTP con refresh single-flight`

---

### Task 7: Motor de sincronización

**Files:** Create `src/main/sync/motor.ts` · Test: `test/motor.test.ts`, `test/integracion-sync.test.ts`

**Interfaces — Produces:**
- `crearMotor({ base, cliente, crearSocket, reloj? })` → `{ iniciar(), detener(), sincronizarAhora(), estado(): EstadoSync, on('estado', fn) }`
  - `EstadoSync = { conexion: 'en-linea' | 'sin-conexion' | 'sincronizando'; pendientes: number; ultimaSync: string | null }`
  - **Pull:** `GET /sync/carta?desde=<cursor kv>` → `aplicarCambiosCarta` → guarda `cursor`. Se dispara al iniciar, al recibir `cambios` por el socket, al reconectar y cada 60 s.
  - **Push:** envía `pendientes` en lotes a `POST /sync/operaciones`; `aplicada` → `marcarAplicadas`; `rechazada` → `marcarRechazada` (y revierte el cambio optimista volviendo a pedir pull); `SinConexion` → `registrarFallo` y reintento con backoff 1 s, 2 s, 4 s… hasta 60 s. Se dispara al encolar, al reconectar y después de cada pull.
  - Pasa a `sin-conexion` ante `SinConexion` o desconexión del socket, y vuelve a `en-linea` en la siguiente llamada exitosa.
- `test/integracion-sync.test.ts` levanta la **API real** (`buildApp` de `apps/api` con la base de test) en un puerto libre y verifica el circuito completo.

- [ ] **Step 1: Tests que fallan** — unitarios con cliente falso: fallo de red → estado `sin-conexion` y la operación sigue pendiente; reintento exitoso → `pendientes = 0`; `rechazada` no se reintenta. Integración: (a) encolar disponibilidad, push, repetir el mismo push (simulando respuesta perdida) → una sola auditoría en el servidor; (b) cambiar un precio en el servidor por REST mientras el motor está detenido, iniciar → la carta local tiene el precio nuevo; (c) borrar un producto en el servidor → desaparece de `leerCarta` tras el pull.
- [ ] **Step 2–5** — `feat(desktop): motor de sincronización`

---

### Task 8: Puente IPC

**Files:** Create `src/compartido/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts` · Modify `src/main/index.ts` · Test: `test/ipc.test.ts`

**Interfaces — Produces:**
- Contrato `ApiGula` (en `compartido/ipc.ts`):
  - `sesion: { estado(): Promise<EstadoSesion>; login(email, password, nombrePc): Promise<EstadoSesion>; usuarios(): Promise<UsuarioPublico[]>; elegirUsuario(usuarioId, pin): Promise<EstadoSesion>; bloquear(): Promise<void>; cerrar(): Promise<void> }` — `EstadoSesion = { tipo: 'sin-dispositivo' } | { tipo: 'bloqueada'; local } | { tipo: 'activa'; local; usuario }`.
  - `carta: { leer(): Promise<CartaLocal>; crearCategoria / editarCategoria / borrarCategoria / ordenarCategorias / crearProducto / editarProducto / borrarProducto / crearGrupo / editarGrupo / borrarGrupo / crearOpcion / editarOpcion / borrarOpcion (online, devuelven lo creado y disparan pull); disponibilidad({ productoId? , opcionId?, disponible }) (outbox); subirFoto(productoId) (abre diálogo de archivo en main) }`.
  - `sync: { estado(): Promise<EstadoSync> }` y eventos `on('sync:estado' | 'carta:cambio' | 'sesion:cambio', fn): () => void`.
- Errores cruzan IPC como `{ codigo, mensaje }` (sin stack).
- `bloquear()` deja la sesión `bloqueada` (hay que elegir usuario + PIN); también se bloquea sola tras **5 minutos** sin interacción del renderer.

- [ ] **Step 1: Tests que fallan** — los handlers (probados como funciones puras con dependencias falsas): `elegirUsuario` con PIN incorrecto devuelve `{ codigo: 'PIN_INCORRECTO' }`; `disponibilidad` encola en la outbox y actualiza la carta local antes de responder; una edición online sin conexión devuelve `{ codigo: 'SIN_CONEXION', mensaje: 'Necesitás conexión para editar la carta.' }`.
- [ ] **Step 2–5** — `feat(desktop): puente IPC tipado`

---

### Task 9: Pantallas de ingreso, usuario y conexión

**Files:** Create `src/renderer/pantallas/{Login,ElegirUsuario}.tsx`, `src/renderer/componentes/Conexion.tsx`, `src/renderer/App.tsx` · Test: `src/renderer/**/*.test.tsx` (jsdom, `window.gula` falso)

**Interfaces — Produces:**
- `sin-dispositivo` → Login (email, contraseña, nombre de la PC con default "PC caja"; muestra el `mensaje` de error de la API).
- `bloqueada` → grilla de usuarios activos (botones grandes con nombre y rol) → teclado numérico en pantalla para el PIN (también acepta teclado físico) → muestra `PIN incorrecto.` / `Demasiados intentos. Esperá 5 minutos…`.
- `activa` → shell con barra superior: nombre del local, usuario activo, botón "Cambiar usuario" (bloquea), indicador de conexión: verde "En línea", gris "Sincronizando…", rojo "Sin conexión — N cambios pendientes"; menú lateral: "Mesas" (placeholder "Llega en la fase 4") y "Carta".
- Navegación del menú según permisos (`puede`): "Carta" visible para todos (la moza solo ve disponibilidad).

- [ ] **Step 1: Tests que fallan** — Login muestra error de la API; ElegirUsuario envía el PIN tipeado en el teclado en pantalla y muestra `PIN incorrecto.`; Conexion muestra "Sin conexión — 3 cambios pendientes" ante ese estado.
- [ ] **Step 2–5** — `feat(desktop): ingreso, usuario y conexión`

---

### Task 10: Editor de carta

**Files:** Create `src/renderer/pantallas/Carta.tsx`, `src/renderer/componentes/EditorProducto.tsx` · Test: `src/renderer/pantallas/Carta.test.tsx`

**Interfaces — Produces:**
- Columna de categorías (crear, renombrar, horario, visible, borrar con confirmación en línea, subir/bajar orden) + lista de productos de la categoría (nombre, precio, switch de disponibilidad, visible) + panel de edición de producto (nombre, descripción, precio en pesos con conversión a centavos, sector, etiquetas, foto, grupos y opciones con min/max y recargo).
- Precio: input en pesos (`2500` o `2.500,50`) → centavos; inválido muestra "Precio inválido".
- Usuario sin `carta.editar` (moza): solo ve la lista con los switches de disponibilidad.
- Sin conexión: los controles de edición se deshabilitan con el aviso "Necesitás conexión para editar la carta."; la disponibilidad sigue funcionando.

- [ ] **Step 1: Tests que fallan** — `parsearPesos('2.500,50') === 250050`, `parsearPesos('abc') === null`; como moza no se ven los botones de editar pero sí el switch; sin conexión el botón "Nuevo producto" está deshabilitado y el switch no.
- [ ] **Step 2–5** — `feat(desktop): editor de carta`

---

### Task 11: Humo end-to-end y empaquetado de desarrollo

**Files:** Create `apps/desktop/e2e/humo.spec.ts`, `apps/desktop/playwright.config.ts` · Modify `.github/workflows/ci.yml` (job opcional en Windows), `infra/README.md` (cómo correr la app contra un servidor)

**Interfaces — Produces:**
- Config de la app: URL del servidor desde `GULA_SERVIDOR` (env) o `kv` (pantalla de login permite cambiarla en un "Opciones avanzadas"), default `http://localhost:3000`.
- Humo con Playwright `_electron`: levanta la API real contra `gula_test` con un local + carta demo, abre la app con una carpeta de datos temporal, hace login, elige al dueño con PIN, ve la categoría "Pizzas" en la carta, apaga la disponibilidad de "Muzzarella" y verifica por la API que quedó `disponible: false`.

- [ ] **Step 1:** test e2e (falla) · **Step 2:** configuración y ajustes hasta que pase · **Step 3:** `pnpm --filter @gula/desktop build` genera la app sin errores · **Step 4: Commit** — `test(desktop): humo end-to-end`
