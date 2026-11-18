# GulaWeb — Diseño del sistema

Fecha: 2026-11-18 · Estado: aprobado

## 1. Intención y por qué

Construir desde cero un **producto vendible a locales gastronómicos** (comida y bebidas): una carta digital por mesa (QR + NFC) desde la que el cliente hace su pedido, y una aplicación de escritorio donde el local recibe y gestiona pedidos, delivery, caja y reportes.

El primer objetivo es **un prototipo funcional para presentarle a un local concreto** (el dueño todavía no lo conoce). Si le gusta, se sigue con él; si no, el producto se adapta y se vende a otro local. Por eso nada específico de un local (marca, carta, mesas) puede estar en el código: todo es configuración por local.

Modelo de negocio: **cobro único + abono mensual mínimo** (mantenimiento, mejoras y servidor). Todos los locales viven en un único VPS propio → el costo de servidor por local debe ser casi cero y una actualización debe llegar a todos a la vez.

## 2. Objetivos

- Carta web mobile-first, rápida con mala señal, con la marca del local.
- Cada mesa tiene un QR/NFC fijo; la mesa solo acepta pedidos si el personal la **abrió**.
- Pedidos en tiempo real en la app de PC, separados y organizados por mesa.
- App de PC: gestionar pedidos, crear pedidos a mano, imprimir comandas, delivery, caja diaria (ingresos, fondo de cambio, egresos), reportes semanal/mensual/trimestral/semestral/anual, perfiles dueño / encargado / mesero.
- La app de PC **sigue funcionando sin internet** (pedidos manuales, comandas, caja) y sincroniza al reconectar.
- Multi-local desde el día uno (un local cargado por ahora).
- Demo impecable: carta real del local cargada, QR/NFC de muestra impresos.

## 3. No objetivos (por ahora)

- Facturación electrónica legal (ARCA/AFIP). Futuro, se cobra aparte.
- Cobro online dentro de la carta (Mercado Pago checkout). Los pagos se registran a mano con su método.
- Integración con PedidosYa / Rappi.
- Carta del cliente funcionando sin internet (depende del celular del cliente).
- Control de stock/inventario de insumos (solo "disponible / sin stock" por producto).
- App móvil nativa.

## 4. Anti-objetivos (fracaso aunque "funcione")

- Que el cliente tenga que registrarse, descargar algo o escribir un código para pedir.
- Que un corte de internet frene la operación del salón.
- Que un pedido se pierda o se duplique al sincronizar.
- Que sumar un segundo local requiera tocar código o hacer otra instalación.
- Que se pueda anular un pedido o movimiento de caja sin dejar rastro de quién lo hizo.
- Una interfaz genérica tipo "plantilla": el diseño es parte de la venta.

## 5. Restricciones

- Hosting: VPS personal, dominio de pruebas propio por ahora; el dominio final se define con el cliente.
- Un desarrollador; stack TypeScript (lo que ya se viene usando).
- PCs de caja Windows, impresoras térmicas ESC/POS (58/80 mm, USB o red).
- Español rioplatense en toda la UI; moneda ARS; zona horaria America/Argentina/Buenos_Aires.

## 6. Enfoques considerados

| Enfoque | Trade-off | Decisión |
|---|---|---|
| **Electron + TypeScript en todo** | Un solo lenguaje, componentes y validaciones compartidas, librerías ESC/POS y SQLite maduras en Node. Instalador ~100 MB. | **Elegido** (lo que ya se usa, más cobertura) |
| Tauri | App ~10 MB, pero impresión y base local en Rust; integración con impresoras menos probada. | Descartado |
| PWA instalable | Lo más simple, pero no imprime directo a térmica (diálogo del navegador) y offline frágil. | Descartado |

Multi-tenant: **una sola instalación compartida** (cada fila con `local_id` + aislamiento en Postgres) en lugar de una instalación por local — encaja con el abono mínimo y las actualizaciones centralizadas.

## 7. Arquitectura

```
 Celular cliente ──HTTPS──┐                         ┌── PC del local (Electron)
 (carta web React)        │                         │   UI React
                          ▼                         │   SQLite local (fuente de verdad local)
                 ┌──────────────────┐   WebSocket   │   Motor de sync (outbox)
                 │ Caddy (HTTPS)    │◄──────────────┤   Impresión ESC/POS
                 │ API Node/Fastify │   + HTTPS     └── Impresoras térmicas
                 │ Socket.IO        │
                 │ PostgreSQL       │
                 │ Archivos (fotos) │
                 └──────────────────┘
                     VPS (Docker Compose)
```

Piezas (monorepo pnpm + Turborepo):

- `apps/api` — Fastify + Drizzle ORM + PostgreSQL + Socket.IO. Auth, multi-local, carta, mesas, pedidos, caja, reportes, sync.
- `apps/carta` — React + Vite, SPA mobile-first. Pública, sin login.
- `apps/desktop` — Electron (electron-vite) + React. SQLite local (better-sqlite3 + Drizzle), sync, impresión, auto-update.
- `packages/shared` — esquemas Zod, tipos, reglas de negocio puras (cálculo de totales, transiciones de estado, permisos).
- `packages/ui` — tokens de diseño y componentes compartidos.
- `infra/` — Docker Compose, Caddyfile, scripts de backup y deploy.

## 8. Modelo de datos (resumen)

Todas las tablas de negocio llevan `local_id`. IDs **UUIDv7 generados en el cliente** (permite crear offline sin choques y ordenar por tiempo).

- **Local**: nombre, slug, marca (logo, colores, tipografía), datos de contacto, horarios, config (impresoras, sectores, métodos de pago habilitados, costo de envío por defecto).
- **Usuario**: local, nombre, rol (dueño / encargado / mesero), email+contraseña (Argon2) y PIN de 4–6 dígitos para cambio rápido en la PC, activo.
- **Sector**: cocina, barra, etc. (a dónde va cada comanda).
- **Categoría**: nombre, orden, visible, horario opcional (ej. "Desayunos 8–12").
- **Producto**: categoría, nombre, descripción, foto, precio, sector, disponible, orden, etiquetas (vegano, sin TACC, picante).
- **GrupoOpciones / Opción**: variantes y extras (ej. "Tamaño: chico/grande", "Extras: +queso $X"), min/max selecciones, recargo.
- **Mesa**: número/nombre, zona (salón, vereda), `token` aleatorio fijo (va en el QR/NFC), capacidad.
- **SesiónMesa**: mesa, abierta_por, abierta_en, cerrada_en, comensales, estado (abierta / cuenta pedida / cerrada). Solo una abierta por mesa.
- **Pedido**: local, origen (QR / manual / delivery), sesión_mesa o datos de delivery, estado, notas, creado_por, timestamps por estado.
- **ÍtemPedido**: producto (+ snapshot de nombre y precio), cantidad, opciones elegidas (snapshot), nota, anulado (con usuario y motivo).
- Estados de Pedido: `pendiente` (solo QR) → `confirmado` (comandas impresas) → `cobrado`; o `rechazado` / `anulado`. Los pedidos manuales nacen `confirmado`.
- **Delivery**: cliente (nombre, teléfono, dirección, referencias), costo de envío, repartidor (texto o usuario), estado (preparando / en camino / entregado), pago al recibir.
- **Pago**: sesión o pedido, método (efectivo, débito, crédito, transferencia, Mercado Pago, otro), monto, propina, turno de caja.
- **TurnoCaja**: abierto_por, fondo de cambio inicial, abierto_en, cerrado_por, cerrado_en, efectivo contado, diferencia.
- **MovimientoCaja**: turno, tipo (ingreso / egreso), categoría (proveedores, sueldos, retiro, otro), monto, motivo, usuario.
- **Auditoría**: quién, qué, cuándo, antes/después — para anulaciones, descuentos, cambios de precio, movimientos de caja.

Los reportes se calculan sobre Pago, MovimientoCaja, Pedido e ÍtemPedido (sin tablas de agregados en v1; vistas/consultas SQL indexadas por `local_id` + fecha).

## 9. Flujos clave

**Abrir mesa → pedido por QR**
1. Llegan clientes; el mesero (o quien sea) abre la mesa en la PC (un clic, opcional cantidad de comensales).
2. Cliente escanea QR o acerca el celular al NFC → `https://<dominio>/<slug-local>/m/<token-mesa>`.
3. Si la mesa está cerrada, la carta se ve igual pero el botón de pedir muestra "Pedile al mozo que habilite la mesa".
4. Cliente arma el carrito (opciones, notas) y envía. Puede pedir varias veces en la misma sesión.
5. El pedido llega en tiempo real a la PC como **pendiente**, con alerta sonora y visual persistente (no se apaga hasta que alguien lo atiende). El cliente ve "Enviado — esperando confirmación".
6. Una mesera revisa el pedido en la PC (puede ajustar ítems/notas), lo **confirma** y se imprimen las comandas por sector (cocina / barra). También puede rechazarlo con motivo. El cliente ve "¡Pedido confirmado!" (o el rechazo) y no hay más estados: cocina y barra trabajan solo con la comanda impresa.
7. El cliente puede tocar "Llamar a la moza/mozo" y "Pedir la cuenta" → alerta en la PC.
8. Cobro: se registran uno o varios pagos (divide cuenta por monto), la sesión se cierra y el token deja de aceptar pedidos.

**Pedido manual** — desde la PC, sobre una mesa abierta o como mostrador/para llevar. Mismo circuito de comanda y cobro. Funciona offline.

**Delivery** — pedido cargado a mano (llamada/WhatsApp) con datos del cliente; tablero propio con estados; costo de envío; cobro al entregar. Funciona offline.

**Caja**
1. Apertura de turno con fondo de cambio.
2. Cada pago queda asociado al turno abierto; egresos/ingresos manuales con motivo.
3. Cierre: el sistema muestra lo esperado por método de pago; se ingresa el efectivo contado y se registra la diferencia.
4. Sin turno abierto no se puede cobrar (se ofrece abrirlo).

**Reportes** (dueño y encargado): rango semanal, mensual, trimestral, semestral, anual o personalizado; ventas totales y por método de pago, egresos, resultado (ventas − egresos), ticket promedio, productos más vendidos, ventas por mesero, por origen (salón / delivery / mostrador), por franja horaria; comparación con el período anterior; exportar a PDF y CSV.

## 10. Roles y permisos

| Acción | Mesero | Encargado | Dueño |
|---|---|---|---|
| Abrir/cerrar mesa, tomar pedidos, ver pedidos | ✔ | ✔ | ✔ |
| Imprimir/reimprimir comanda | ✔ | ✔ | ✔ |
| Cobrar | — | ✔ | ✔ |
| Anular ítem/pedido, descuentos | pide autorización (PIN encargado) | ✔ | ✔ |
| Abrir/cerrar caja, egresos | — | ✔ | ✔ |
| Delivery | ✔ | ✔ | ✔ |
| Editar carta, precios, disponibilidad | solo disponibilidad | ✔ | ✔ |
| Reportes | — | ✔ (sin resultado económico) | ✔ |
| Usuarios, mesas, configuración, marca | — | — | ✔ |

La matriz vive en `packages/shared` y se aplica en API y desktop. Cambio de usuario en la PC con PIN (la PC queda logueada al local; cada acción se firma con el usuario activo).

## 11. Offline y sincronización

- La app de PC es **local-first**: la UI siempre lee y escribe en SQLite local. Con o sin internet funciona igual.
- Cada cambio local se guarda también en una **outbox** (operaciones con UUID, idempotentes). El motor de sync las envía cuando hay conexión; el servidor las aplica una sola vez (idempotencia por id de operación).
- El servidor empuja por WebSocket los cambios que vienen de afuera (pedidos QR, cambios hechos desde otra PC) y la PC los guarda en SQLite.
- Reglas de conflicto:
  - Pedidos, ítems, pagos y movimientos de caja: **solo se agregan**; los cambios de estado son eventos con timestamp → no hay conflicto real, se aplican en orden.
  - Carta y configuración: último cambio gana (`updated_at`), editable solo con conexión en v1.
- *(Decisión del diseñador)* El servidor **rechaza pedidos QR si ninguna PC del local está conectada** (presencia por WebSocket con heartbeat), para que nunca entre un pedido que nadie ve ni imprime.
- Los pedidos QR **siempre requieren confirmación** de una mesera en la PC; recién al confirmar se imprimen las comandas (decidido con el cliente).
- Sin internet: los QR no pueden pedir (la carta muestra "Pedí al mozo"); la PC muestra un indicador claro "Sin conexión — N cambios pendientes".
- Al volver: sincroniza en segundo plano, sin intervención.
- **Una sola PC por local** (decidido): toda la operación del salón, caja e impresión pasa por ella; los meseros no usan celular. Esto simplifica la sync: la PC es la única que escribe operaciones; el servidor solo le agrega pedidos QR pendientes. *(Decisión del diseñador)* El servidor registra un único dispositivo activo por local; registrar otro desactiva el anterior.

## 12. Impresión

- Hardware estándar provisto con el producto: **impresora térmica 80 mm** conectada por **USB** (el mismo tipo usado en proyectos anteriores; se instala como impresora de Windows y se le envía ESC/POS crudo por el spooler, lo que evita depender del modelo exacto). Una sola impresora imprime todas las comandas; cada sector (cocina / barra) sale en un ticket separado con corte de papel, para que la mesera los reparta. Soporte multi-impresora por sector queda preparado en la config pero no es requisito.
- ESC/POS directo desde el proceso main de Electron.
- Comanda por sector: mesa/origen, mesero, hora, ítems con opciones y notas en grande. Reimpresión marcada como "REIMPRESIÓN".
- Ticket de cuenta (no fiscal, "Documento no válido como factura") y cierre de caja.
- Modo vista previa en pantalla para la demo sin impresora.

## 13. Seguridad

- HTTPS (Caddy), JWT de acceso corto + refresh token rotativo para la PC; dispositivo registrado por local.
- Carta pública: sin login; el token de mesa es aleatorio (≥ 128 bits); rate limit por IP y por mesa; pedidos solo con sesión abierta.
- Aislamiento por local con Row-Level Security en Postgres además del filtro en la API.
- Validación Zod en ambos lados; precios siempre recalculados en el servidor (nunca se confía en el total del cliente).
- Auditoría de acciones sensibles. Backups diarios cifrados de Postgres fuera del VPS.

## 14. Diseño de interfaz

- **Carta**: mobile-first, foto protagonista, categorías como pestañas fijas, carrito flotante, tema derivado de la marca del local (tokens), carga < 2 s en 3G, imágenes optimizadas (sharp → WebP/AVIF), accesible (contraste, tamaños táctiles).
- **App PC**: densa pero clara; vista principal = plano/grilla de mesas con estado por color (libre, abierta, pedido pendiente de confirmar, llamó a la moza, cuenta pedida) y una bandeja fija de pendientes con alerta que no se apaga hasta atenderla; columnas de pedidos por estado; atajos de teclado; botones grandes para pantalla táctil; modo oscuro.
- Sistema de tokens compartido en `packages/ui`. Micro-animaciones para la llegada de pedidos (guía de `motion-design`).
- Se diseñan mockups antes de implementar cada pantalla principal.

## 15. Infraestructura y despliegue

- VPS con Docker Compose: `caddy`, `api`, `postgres`, volumen de fotos. Carta servida como estáticos por Caddy.
- Dominio de pruebas: `<dominio>/<slug-local>/...`; cuando haya dominio propio del cliente se agrega como alias.
- Desktop: instalador NSIS para Windows, auto-update con electron-updater desde el propio VPS.
- Alta de un local nuevo en v1: script/CLI de superadmin (`pnpm admin crear-local`). Panel de superadmin web, más adelante.
- Observabilidad mínima: logs estructurados (pino), healthcheck, alerta si cae la API.

## 16. Fases

**Se presenta al dueño recién con todas las fases terminadas**: un producto casi listo para vender, no una demo (decidido).

1. **Base**: monorepo, CI, infra en VPS, auth, multi-local, modelo de datos.
2. **Carta + pedidos en tiempo real**: carta con la carta real del local, abrir mesa, pedido QR → PC con alerta → confirmar.
3. **App PC operativa**: pedidos manuales, estados, comandas impresas, edición de carta.
4. **Caja y cobro**: turnos, pagos, egresos, cierre.
5. **Reportes**.
6. **Delivery**.
7. **Offline completo** (local-first ya está desde la fase 3; aquí se endurece sync, pruebas de corte de red).
8. **Pulido y salida**: datos reales, QR/NFC impresos, instalador firmado, manual corto de uso, guion de presentación.

## 17. Lo que queda a criterio del constructor

Librerías puntuales dentro del stack (ej. TanStack Query, Zustand, componentes de UI), estructura interna de carpetas, esquema SQL exacto, formato del protocolo de sync, estrategia de testing (Vitest + Playwright, con tests sobre reglas de negocio y sync), diseño visual detallado sobre los lineamientos de la sección 14.

## 18. Insumos pendientes

- Carta del local en PDF (para cargar datos reales y extraer marca/estructura de opciones).
