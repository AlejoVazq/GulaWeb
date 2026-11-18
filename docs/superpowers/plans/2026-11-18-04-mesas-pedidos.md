# Fase 4 — Mesas y pedidos: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesas con QR/NFC fijos, sesiones de mesa abiertas por el personal, pedidos del cliente que entran como pendientes con alerta persistente en la PC, confirmación/rechazo, pedidos manuales y de mostrador (también sin conexión), avisos "llamar a la moza" / "pedir la cuenta" y el estado visible para el cliente.

**Architecture:** El servidor es la fuente de verdad del salón, pero la PC opera local-first: abrir/cerrar mesa, crear pedidos manuales, confirmar/rechazar y atender avisos son **operaciones de outbox** (tipos registrados con `registrarTipoOperacion`). La PC trae el estado del salón con un pull propio (`GET /sync/salon`). Los pedidos del cliente entran por endpoints públicos, el servidor recalcula precios con la carta vigente y avisa a la PC por Socket.IO (`cambios {tema:'salon'}`). La API lleva **presencia** de la PC por local (sockets conectados) y rechaza pedidos QR si no hay ninguna conectada (spec §11).

**Tech Stack:** el de las fases 1–3. Sin dependencias nuevas salvo lo que pida el sonido de alerta (Web Audio, nativo).

**Spec:** `docs/superpowers/specs/2026-11-18-gulaweb-design.md` (§8 Mesa/SesiónMesa/Pedido/ÍtemPedido, §9 flujos, §11, §13, §14). Base: fases 1–3.

## Global Constraints

- Todas las de las fases 1–3.
- Token de mesa: 16 bytes aleatorios en base64url (22 caracteres), único global, nunca reutilizado; regenerable por el dueño (invalida el QR viejo).
- **Los precios de un pedido QR los calcula el servidor** con la carta vigente (`precioUnitario` de `@gula/shared`); el total que mande el cliente se ignora.
- Pedido QR solo si: la mesa tiene sesión `abierta` o `cuenta_pedida`, hay una PC del local conectada, y cada producto/opción está vigente, visible, disponible y su categoría en horario.
- Estados de pedido: `pendiente` (solo QR) → `confirmado` | `rechazado`; `confirmado` → `anulado` (con autorización, fase 6 suma `cobrado`). Pedidos manuales nacen `confirmado`.
- Número de pedido: lo asigna **la PC** al confirmar (o al crear uno manual), correlativo por día de Buenos Aires (`kv`), y viaja en la operación.
- Una sola sesión no cerrada por mesa (índice único parcial en el servidor).
- El cliente ve solo: `pendiente` → "Enviado — esperando confirmación", `confirmado` → "¡Pedido confirmado!", `rechazado` → "No pudimos tomar tu pedido: <motivo>".
- Estética mínima funcional (fase 10).

## Review Focus

1. **QR fotografiado usado desde afuera con la mesa cerrada** → `POST` del pedido responde 409 `MESA_CERRADA` y la carta muestra "Pedile a la moza que habilite la mesa". → test en Task 3.
2. **Cliente manda precios o productos manipulados** (precio 1, producto sin stock, opción de otro producto, cantidad 0 o 999) → el servidor recalcula o rechaza con 400 y nunca guarda un precio del cliente. → test en Task 3.
3. **El cliente toca "Enviar" dos veces o la red reintenta** → el `id` del pedido es del cliente y el segundo envío devuelve el mismo pedido (no se duplica la comanda). → test en Task 3.
4. **Corte de internet con mesas abiertas** → la PC sigue abriendo mesas, cargando pedidos manuales y confirmando; al volver todo llega al servidor una vez y en orden; los QR quedan rechazados durante el corte. → test en Task 7 (integración).
5. **Llega un pedido QR mientras la moza está en otra pantalla** → la alerta sonora y visual persiste hasta que alguien lo confirma o rechaza; no se apaga sola. → test en Task 10.

---

## Estructura de archivos

```
packages/shared/src/salon.ts (+test)            # tipos públicos de mesa/pedido, numeración del día
apps/api/src/db/schema/salon.ts                 # mesas, sesiones_mesa, pedidos, items_pedido, avisos_mesa
apps/api/src/db/migraciones/0007_salon*.sql, 0008_salon_rls.sql
apps/api/src/salon/{mesas.rutas.ts,publico.ts,operaciones.ts,pull.ts,precios.ts}
apps/api/src/tiempoReal/presencia.ts
apps/api/test/salon-*.test.ts
apps/desktop/src/main/db/{migraciones.ts (v2), salon.ts}
apps/desktop/src/main/servicios.salon.ts
apps/desktop/src/renderer/pantallas/{Mesas,DetalleMesa}.tsx
apps/desktop/src/renderer/componentes/{Pendientes,TomarPedido,Alerta}.tsx
apps/carta/src/{mesa.ts,componentes/EstadoPedido.tsx}
```

---

### Task 1: Tipos del salón en shared

**Files:** Create `packages/shared/src/salon.ts` · Test: `salon.test.ts`

**Interfaces — Produces:**
- `type EstadoPedido = 'pendiente' | 'confirmado' | 'rechazado' | 'anulado'`, `type OrigenPedido = 'qr' | 'manual' | 'mostrador'`, `type EstadoSesion = 'abierta' | 'cuenta_pedida' | 'cerrada'`, `type TipoAviso = 'llamar' | 'cuenta'`.
- `type ItemSolicitado = { productoId: string; seleccion: Seleccion; nota: string; cantidad: number }` (cantidad 1–50, nota ≤ 140).
- `type MesaPublica = { mesa: { nombre: string }; local: { nombre: string; slug: string }; aceptaPedidos: boolean; motivo: 'mesa_cerrada' | 'local_sin_conexion' | null }`.
- `type PedidoPublico = { id: string; estado: EstadoPedido; motivoRechazo: string | null; total: number; items: { nombre: string; cantidad: number; resumenOpciones: string; subtotal: number }[] }`.
- `diaOperativo(fecha: Date): string` — `AAAA-MM-DD` en Buenos Aires, cambiando a las **06:00** (un pedido a las 02:00 pertenece al día anterior).
- `resumirOpciones(producto: ProductoPublico, sel: Seleccion): string`.

- [ ] **Step 1: Tests que fallan** — `diaOperativo(new Date('2026-11-19T05:00:00Z'))` (02:00 BA) → `'2026-11-18'`; a las 07:00 BA → `'2026-11-19'`; `resumirOpciones` con Tamaño=Grande y Extras=[Cheddar, Bacon] → `'Grande, Cheddar, Bacon'`.
- [ ] **Step 2–5** — `feat(shared): tipos del salón`

---

### Task 2: Esquema del salón y administración de mesas (API)

**Files:** Create `apps/api/src/db/schema/salon.ts`, migraciones, `src/salon/mesas.rutas.ts` · Test: `test/salon-mesas.test.ts`

**Interfaces — Produces:**
- Tablas (con `local_id`, RLS, `actualizado_en` con trigger, `eliminado_en`):
  - `mesas(nombre, zona text null, capacidad int null, orden, token text unique not null)`
  - `sesiones_mesa(mesa_id, estado, comensales int null, abierta_por uuid, abierta_en, cerrada_por uuid null, cerrada_en null)` + índice único parcial `(mesa_id) where estado <> 'cerrada'`
  - `pedidos(origen, estado, sesion_id null, mesa_id null, numero int null, dia text null, notas text null, motivo_rechazo text null, creado_por uuid null, confirmado_por uuid null, confirmado_en null, rechazado_en null)`
  - `items_pedido(pedido_id, producto_id, nombre, precio_unitario int, cantidad int check 1..50, seleccion jsonb, resumen_opciones text, nota text, sector_id uuid null, anulado bool default false)`
  - `avisos_mesa(sesion_id, tipo, atendido_por uuid null, atendido_en null)`
- Rutas (`admin.configurar`): `GET|POST /salon/mesas`, `PATCH|DELETE /salon/mesas/:id`, `POST /salon/mesas/:id/regenerar-token` → `{ token }`. Respuestas incluyen `url: '/<slug>/m/<token>'`. No se borra una mesa con sesión no cerrada → 409 `MESA_OCUPADA`.

- [ ] **Step 1: Tests que fallan** — crear 3 mesas da tokens distintos de 22 caracteres base64url; regenerar cambia el token y el viejo ya no resuelve (Task 3); borrar con sesión abierta → 409; mesero → 403; RLS: mesas de otro local invisibles.
- [ ] **Step 2–5** — `feat(api): mesas y esquema del salón`

---

### Task 3: Endpoints públicos del cliente (API)

**Files:** Create `src/salon/publico.ts`, `src/salon/precios.ts`, `src/tiempoReal/presencia.ts` · Modify `src/tiempoReal/socket.ts` · Test: `test/salon-publico.test.ts`

**Interfaces — Produces:**
- Presencia: `app.pcsConectadas(localId): number` (sockets autenticados en la sala del local).
- `GET /publico/mesas/:token` → `MesaPublica` (404 `MESA_NO_ENCONTRADA`).
- `POST /publico/mesas/:token/pedidos` `{ id: uuid, items: ItemSolicitado[] (1–30) }` → `201 PedidoPublico` (o `200` con el mismo pedido si el `id` ya existe para esa mesa).
  - Errores: 409 `MESA_CERRADA`; 503 `LOCAL_SIN_CONEXION` ("El local no está recibiendo pedidos por acá en este momento. Pedile a la moza."); 400 `PRODUCTO_NO_DISPONIBLE` con el nombre; 400 `DATOS_INVALIDOS` (selección inválida según `validarSeleccion` con la carta del servidor).
  - `armarItems(tx, items)` en `precios.ts`: lee la carta vigente, valida, calcula `precio_unitario` y `resumen_opciones`, copia `sector_id`.
  - Rate limit: 10 pedidos/min por token de mesa y 30/min por IP.
  - Tras crear: `app.avisar(localId, 'salon')`.
- `GET /publico/pedidos/:id?token=<token>` → `PedidoPublico` (el token debe ser el de la mesa del pedido; si no, 404).
- `POST /publico/mesas/:token/avisos` `{ tipo: 'llamar' | 'cuenta' }` → 201; requiere sesión no cerrada; un aviso del mismo tipo sin atender no se duplica (devuelve el existente); `cuenta` pasa la sesión a `cuenta_pedida`. Rate limit 6/min por token.

- [ ] **Step 1: Tests que fallan** — mesa cerrada → 409; sin PC conectada (presencia 0) → 503; con PC conectada (socket en el test) → 201 con precios del servidor aunque el cliente mande `precio: 1` en los ítems; producto sin stock → 400 con su nombre; opción de otro producto → 400; mismo `id` dos veces → un solo pedido; `GET` con token de otra mesa → 404; aviso `cuenta` cambia el estado de la sesión y no se duplica.
- [ ] **Step 2–5** — `feat(api): pedidos y avisos del cliente`

---

### Task 4: Operaciones del salón (API, outbox)

**Files:** Create `src/salon/operaciones.ts` · Modify `src/sync/rutas.ts` (importar) · Test: `test/salon-operaciones.test.ts`

**Interfaces — Produces** (tipos registrados; todos avisan `salon`):
- `mesa.abrir` `{ sesionId, mesaId, comensales? }` (`mesa.operar`) — falla `MESA_OCUPADA` si ya hay una no cerrada.
- `mesa.cerrar` `{ sesionId }` (`mesa.operar`) — en esta fase cierra directo; la fase 6 exigirá cobro.
- `pedido.crear` `{ pedidoId, origen: 'manual' | 'mostrador', sesionId?, numero, dia, notas?, items: { itemId, productoId, nombre, precioUnitario, cantidad, seleccion, resumenOpciones, nota, sectorId }[] }` (`pedido.tomar`) — nace `confirmado`; precios del snapshot de la PC (personal de confianza; validados ≥ 0 y ≤ `PRECIO_MAXIMO`).
- `pedido.confirmar` `{ pedidoId, numero, dia, items?: { itemId, cantidad }[] /*ajustes; cantidad 0 = quitar*/ }` (`pedido.confirmar`) — solo desde `pendiente`.
- `pedido.rechazar` `{ pedidoId, motivo (1–140) }` (`pedido.confirmar`) — solo desde `pendiente`.
- `aviso.atender` `{ avisoId }` (`mesa.operar`).
- Transición inválida → `rechazada` `ESTADO_INVALIDO`.

- [ ] **Step 1: Tests que fallan** — abrir dos veces la misma mesa con sesiones distintas → la segunda `MESA_OCUPADA`; confirmar un pendiente asigna número y día; confirmar un rechazado → `ESTADO_INVALIDO`; ajustar cantidad a 0 en la confirmación quita el ítem; pedido manual con precio negativo → `DATOS_INVALIDOS`; reintento de `pedido.crear` con el mismo id de operación → un solo pedido.
- [ ] **Step 2–5** — `feat(api): operaciones del salón`

---

### Task 5: Pull del salón (API)

**Files:** Create `src/salon/pull.ts` · Test: `test/salon-pull.test.ts`

**Interfaces — Produces:**
- `GET /sync/salon?desde=` (`pedido.ver`) → `{ cursor, mesas, sesiones, pedidos, items, avisos }` con el mismo contrato que `/sync/carta` (solape 30 s, filas completas sin `localId`). Sin `desde`: mesas completas + sesiones no cerradas + sus pedidos/ítems/avisos + lo cerrado en las últimas 24 h.

- [ ] **Step 1: Tests que fallan** — sin `desde` no trae sesiones cerradas hace más de 24 h; con `desde` trae un pedido QR nuevo y su ítem.
- [ ] **Step 2–5** — `feat(api): pull del salón`

---

### Task 6: Base local del salón (desktop)

**Files:** Modify `apps/desktop/src/main/db/migraciones.ts` (migración 2) · Create `src/main/db/salon.ts` · Test: `test/salon-local.test.ts`

**Interfaces — Produces:**
- Tablas locales espejo de las del Task 2 (+ `kv` para el correlativo `numero:<dia>`).
- `aplicarCambiosSalon(base, pull)` (upsert con la misma regla de `actualizadoEn`).
- `leerSalon(base): Salon` → `{ mesas: (Mesa & { sesion: Sesion | null; pendientes: number; avisos: Aviso[] })[]; pendientes: (Pedido & { items; mesa })[] }` ordenado por `orden`/hora.
- `leerMesa(base, mesaId)` → mesa + sesión + pedidos con ítems + avisos.
- Cambios optimistas locales que reflejan cada operación del Task 4: `abrirMesaLocal`, `cerrarMesaLocal`, `crearPedidoLocal`, `confirmarPedidoLocal`, `rechazarPedidoLocal`, `atenderAvisoLocal`.
- `siguienteNumero(base, dia): number` — correlativo atómico por día.

- [ ] **Step 1: Tests que fallan** — `siguienteNumero` da 1, 2, 3 y reinicia con otro día; abrir mesa local la muestra ocupada; un pull con un pedido QR pendiente aparece en `pendientes`; confirmarlo local lo saca de `pendientes`.
- [ ] **Step 2–5** — `feat(desktop): salón en la base local`

---

### Task 7: Servicios del salón y sincronización (desktop)

**Files:** Create `src/main/servicios.salon.ts` · Modify `compartido/ipc.ts`, `servicios.ts`, `sync/motor.ts` (pull de salón además de carta), `ipc.ts` · Test: `test/servicios-salon.test.ts`, `test/integracion-salon.test.ts`

**Interfaces — Produces** (canales IPC nuevos; todos local-first: cambio optimista + `encolar` + `sincronizarAhora`):
- `salon:leer(): Salon`, `salon:mesa(mesaId)`, `salon:abrirMesa({ mesaId, comensales? })`, `salon:cerrarMesa({ sesionId })`, `salon:crearPedido({ origen, sesionId?, notas?, items: { productoId, seleccion, nota, cantidad }[] })` (precios y resumen calculados en main con la carta local; valida con `validarSeleccion`), `salon:confirmar({ pedidoId, ajustes? })`, `salon:rechazar({ pedidoId, motivo })`, `salon:atenderAviso({ avisoId })`.
- Evento `salon:cambio`.
- El motor hace push → pull carta → pull salón; el socket dispara pull en `cambios` de cualquier tema.

- [ ] **Step 1: Tests que fallan** — unitarios: crear pedido manual sin conexión queda en la outbox y visible localmente con número 1; confirmar asigna el siguiente número. Integración (API real): con la PC "desconectada" (cliente que falla) abrir mesa + pedido manual + volver la red → el servidor tiene la sesión y el pedido una vez; un pedido QR creado por la API aparece en `salon:leer().pendientes` tras el pull.
- [ ] **Step 2–5** — `feat(desktop): servicios del salón`

---

### Task 8: Pantalla de mesas (desktop)

**Files:** Create `src/renderer/pantallas/Mesas.tsx` · Modify `Shell.tsx` · Test: `Mesas.test.tsx`

**Interfaces — Produces:**
- Grilla de mesas por zona; cada mesa muestra nombre y estado con color + texto (no solo color): Libre / Abierta (comensales, minutos) / **Pedido pendiente** / **Llamó a la moza** / **Pidió la cuenta**.
- Clic en mesa libre → diálogo "Abrir mesa" (comensales opcional). Clic en mesa ocupada → `DetalleMesa`.
- Botón "Pedido de mostrador".

- [ ] **Step 1: Tests que fallan** — mesa con pendiente muestra "Pedido pendiente"; abrir una mesa libre llama a `salon:abrirMesa` con los comensales.
- [ ] **Step 2–5** — `feat(desktop): pantalla de mesas`

---

### Task 9: Detalle de mesa y toma de pedido (desktop)

**Files:** Create `src/renderer/pantallas/DetalleMesa.tsx`, `src/renderer/componentes/TomarPedido.tsx` · Test: `DetalleMesa.test.tsx`, `TomarPedido.test.tsx`

**Interfaces — Produces:**
- Detalle: pedidos de la sesión (número, hora, estado, ítems con opciones y notas, total), avisos con botón "Atendido", botones "Nuevo pedido" y "Cerrar mesa" (confirmación en línea).
- `TomarPedido`: buscador + categorías de la carta local, selección de opciones con las mismas reglas que la carta web (`validarSeleccion`), nota, cantidad, resumen con total, "Enviar a cocina".

- [ ] **Step 1: Tests que fallan** — agregar un producto con grupo obligatorio sin elegir no habilita "Agregar"; "Enviar a cocina" llama a `salon:crearPedido` con los ítems; "Cerrar mesa" pide confirmación.
- [ ] **Step 2–5** — `feat(desktop): detalle de mesa y toma de pedido`

---

### Task 10: Bandeja de pendientes con alerta persistente (desktop)

**Files:** Create `src/renderer/componentes/Pendientes.tsx`, `src/renderer/componentes/Alerta.tsx` · Modify `Shell.tsx` · Test: `Pendientes.test.tsx`

**Interfaces — Produces:**
- Bandeja fija visible en todas las secciones con el contador de pendientes y avisos; cada pendiente muestra mesa, hora, ítems y botones **Confirmar** (permite ajustar cantidades/quitar ítems antes) y **Rechazar** (motivo obligatorio, con sugerencias "Sin stock", "Cocina cerrada").
- `Alerta`: mientras haya pendientes o avisos sin atender, suena un aviso corto (Web Audio, 2 tonos) cada 8 s y la barra superior parpadea; se apaga **solo** cuando no queda nada sin atender. Botón "Silenciar 1 minuto" (vuelve a sonar si sigue habiendo pendientes).

- [ ] **Step 1: Tests que fallan** — con un pendiente, `Alerta` llama al reproductor (inyectado) y lo vuelve a llamar a los 8 s (timers falsos); al confirmarse el último pendiente deja de sonar; "Silenciar 1 minuto" suspende y reanuda.
- [ ] **Step 2–5** — `feat(desktop): pendientes con alerta persistente`

---

### Task 11: Pedido desde la carta del cliente

**Files:** Create `apps/carta/src/mesa.ts`, `src/componentes/EstadoPedido.tsx` · Modify `src/api.ts`, `src/componentes/Carrito.tsx`, `src/paginas/Carta.tsx` · Test: `src/componentes/EstadoPedido.test.tsx`, `src/paginas/Carta.test.tsx`

**Interfaces — Produces:**
- En `/:slug/m/:token`: carga `MesaPublica`; si `aceptaPedidos`, el botón del carrito dice "Enviar pedido · $ total"; si no, el texto según `motivo` (`mesa_cerrada` → "Pedile a la moza que habilite la mesa", `local_sin_conexion` → "Hacé tu pedido a la moza").
- Enviar: genera el `id` (UUIDv7) una vez por envío y lo reutiliza en reintentos; vacía el carrito al recibir 201/200; muestra `EstadoPedido` y consulta `GET /publico/pedidos/:id` cada 5 s hasta `confirmado` o `rechazado` (también al volver a la pestaña).
- Botones "Llamar a la moza" y "Pedir la cuenta" con confirmación "¡Listo! Ya le avisamos." (se deshabilitan 60 s).
- Sin token (`/:slug`): carta de solo lectura, como hasta ahora.

- [ ] **Step 1: Tests que fallan** — con mesa abierta, enviar hace `POST` con los ítems sin precios y muestra "Enviado — esperando confirmación"; al pasar a `confirmado` muestra "¡Pedido confirmado!"; mesa cerrada muestra "Pedile a la moza que habilite la mesa" y el botón deshabilitado; un fallo de red reintenta con el mismo `id`.
- [ ] **Step 2–5** — `feat(carta): pedido desde la mesa`

---

### Task 12: Humo end-to-end del circuito completo

**Files:** Modify `apps/desktop/e2e/humo.spec.ts` (nuevo test) · Modify `apps/api/src/admin/seedDemo.ts` (crear 10 mesas en "Salón" y 4 en "Vereda") 

- [ ] **Step 1:** test e2e: la PC abre la Mesa 3; un `fetch` que simula al cliente manda un pedido por `/publico/mesas/<token>/pedidos`; en la PC aparece en la bandeja con la alerta; se confirma; el `GET /publico/pedidos/:id` devuelve `confirmado` con número 1.
- [ ] **Step 2:** ajustes hasta que pase · **Step 3: Commit** — `test: humo del circuito de pedido QR`
