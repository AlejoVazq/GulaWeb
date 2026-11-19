# Rediseño visual (carta "La Comanda" + caja "Línea de colectivo") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el look de la carta y de la app de caja por las dos direcciones aprobadas, con un papel de comanda compartido y temas por local, sin cambiar flujos ni lógica de negocio.

**Architecture:** Nuevo paquete `packages/ui` (fuente TS consumida por alias, como `@gula/shared`) con `<PapelComanda>`, tipografías auto-alojadas (fontsource) y una base CSS común. La validación de la marca pasa a `@gula/shared` para que carta, API/CLI y escritorio lean lo mismo. Cada app reescribe su `estilos.css` en su propio mundo y ajusta el marcado de sus componentes; la lógica (hooks, IPC, servicios) no se toca.

**Tech Stack:** React 19, CSS plano, Vite 6 (carta), electron-vite (caja), vitest + Testing Library, Playwright (humo), fontsource.

**Spec:** `docs/superpowers/specs/2026-11-19-rediseno-visual-design.md` (leer §7–§12 antes de cada tarea visual). Mockups de referencia: `.superpowers/brainstorm/1667-1795120966/content/direcciones-carta.html` y `direcciones-caja.html` (abrirlos en el navegador; son la referencia de composición, no código a copiar).

## Global Constraints

- Sin Tailwind ni librerías de componentes. CSS plano, variables en `:root` / `[data-tema]`.
- Copia en español rioplatense; importes con `formatearPrecio` de `@gula/shared` y `font-variant-numeric: tabular-nums`.
- Contraste ≥ 4.5:1 en texto; objetivos táctiles ≥ 44 px; foco visible en todo control; `prefers-reduced-motion: reduce` desactiva toda animación no esencial.
- Nunca comunicar un estado solo con color: siempre texto.
- Prohibido (impeccable craft-floor): eyebrows/kickers sobre títulos, gradientes de texto, glass decorativo, barra lateral de color en cajas redondeadas, sombras duras desplazadas, emojis/glifos Unicode como íconos, crema + terracota.
- Carta B/N: `--tinta: #0b0b0b`, `--papel: #ffffff`, fondo de página `#fbfaf7` en claro; gris solo en descripciones.
- Caja, colores de sección: Mesas `#16583d` (placa `#efe3bf`), Delivery `#1c4c97`, Caja `#d79a17` (texto oscuro), Reportes `#6e1c38`, Carta `#11606b`, Impresión `#3d4249`; estado urgente `#d8361b`, cuenta `#f0b429`; fondo de trabajo `#eef0ec`; riel `#15171a`.
- Tipografías: carta Archivo (variable con eje `wdth`, roman + itálica) + Azeret Mono; caja Barlow (400/500/600/700) + Barlow Condensed (600/700/800) + Azeret Mono. Solo subconjunto latino.
- Estados de pedido = los reales (`pendiente|confirmado|cobrado|rechazado|anulado`); no se agregan estados de cocina.
- No se modifica el ticket ESC/POS, sync, permisos ni IPC (salvo agregar `logo` a `LocalInfo`, tarea 13).
- Hook de impeccable activo: atender sus avisos después de cada edición de UI (arreglar lo real; nunca silenciar sin evidencia).
- Al cerrar cada tarea: `pnpm --filter <paquete> test` y `typecheck` en verde.

## Review Focus

1. **Nombres y notas largas** ("Gin Beefeater con agua tónica y pepino" + nota de 140 caracteres) en la fila de carta, el papel de comanda y la columna Entrando: deben envolver sin pisar el precio ni el botón. → tests en tareas 2 y 5 (break-ui en tarea 15).
2. **Comanda con muchos ítems** (20+ líneas) en el celular: el papel abierto hace scroll interno y el botón "Mandar a la barra" queda siempre visible. → test en tarea 6.
3. **Envío que falla** (red caída / API 409 mesa cerrada): el papel no se corta, muestra el error y "Reintentar"; un doble toque no manda dos pedidos. → test en tarea 6.
4. **Local sin tema/lema/logo** (otro local futuro con `marca: {}`): la carta se ve completa con el tema por defecto y el nombre en lugar del logo; la caja muestra solo el nombre. → tests en tareas 3 y 13.
5. **Salón grande** (30 mesas, nombres "Barra 1", "Patio 12") y pantalla 1366×768: la grilla se adapta sin cortar nombres y la columna Entrando no tapa mesas. → test en tarea 10.

---

### Task 1: Paquete `@gula/ui` con tipografías y base CSS

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/vitest.config.ts`, `packages/ui/src/index.ts`, `packages/ui/src/base.css`, `packages/ui/src/fuentes-carta.css`, `packages/ui/src/fuentes-caja.css`, `packages/ui/src/test-setup.ts`
- Modify: `apps/carta/package.json`, `apps/carta/vite.config.ts`, `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`, `apps/desktop/vitest.config.ts`

**Interfaces:**
- Produces: paquete `@gula/ui` (`"exports": { ".": "./src/index.ts", "./base.css": "./src/base.css", "./fuentes-carta.css": "./src/fuentes-carta.css", "./fuentes-caja.css": "./src/fuentes-caja.css", "./papel.css": "./src/papel.css" }`), alias `@gula/ui` → `packages/ui/src/index.ts` en los tres configs de Vite/vitest (los `.css` se resuelven por `exports`).
- `base.css` define: `--ui-curva-salida: cubic-bezier(.16,1,.3,1)`, `--ui-dur-rapida: 140ms`, `--ui-dur-media: 240ms`, `--ui-dur-firma: 520ms`; `:focus-visible` con anillo de 3 px `currentColor` y offset 2 px; `::selection` usando `--ui-seleccion-fondo/-texto` (cada app las define); `.ui-tabular { font-variant-numeric: tabular-nums }`; bloque `@media (prefers-reduced-motion: reduce)` que lleva `animation-duration`/`transition-duration` a `0.01ms`.

- [ ] **Step 1:** Crear el paquete. Dependencias: `react` (peer), `@fontsource-variable/archivo`, `@fontsource/azeret-mono`, `@fontsource/barlow`, `@fontsource/barlow-condensed`; devDeps iguales a las de `apps/carta` para tests (jsdom, testing-library, vitest). Scripts `test`, `lint`, `typecheck` como en `packages/shared`.
- [ ] **Step 2:** `fuentes-carta.css` importa solo los CSS latinos de Archivo (verificar en `node_modules/@fontsource-variable/archivo` los archivos que incluyen el eje `wdth`, roman e itálica) y Azeret Mono 400/600. `fuentes-caja.css` importa Barlow 400/500/600/700, Barlow Condensed 600/700/800, Azeret Mono 400/600, latinos. Todos con `font-display: swap` (fontsource ya lo trae).
- [ ] **Step 3:** Agregar `@gula/ui: workspace:*` a carta y desktop, el alias en `apps/carta/vite.config.ts`, `apps/desktop/electron.vite.config.ts` (renderer) y `apps/desktop/vitest.config.ts`. `pnpm install`.
- [ ] **Step 4:** Test `packages/ui/src/index.test.ts`: `it('exporta PapelComanda y selloDeEstado')` (falla hasta la tarea 2; en esta tarea, exportar un `export const VERSION_UI = 1` y testear eso).
- [ ] **Step 5:** Run `pnpm --filter @gula/ui test && pnpm --filter @gula/carta build && pnpm --filter @gula/desktop build` → PASS / builds OK.
- [ ] **Step 6:** Commit `build(ui): paquete @gula/ui con tipografías auto-alojadas y base común`.

### Task 2: `<PapelComanda>` y `selloDeEstado`

**Files:**
- Create: `packages/ui/src/PapelComanda.tsx`, `packages/ui/src/papel.css`, `packages/ui/src/sello.ts`, `packages/ui/src/PapelComanda.test.tsx`
- Modify: `packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `EstadoPedido` de `@gula/shared`.
- Produces:
```ts
export type LineaPapel = { id: string; cantidad: number; nombre: string; importe: number; detalle?: string; quitada?: boolean };
export type Sello = { texto: 'ENVIADO' | 'CONFIRMADO' | 'RECHAZADO' | 'ANULADO'; tono: 'neutro' | 'ok' | 'mal' };
export function selloDeEstado(estado: EstadoPedido): Sello;
export type PropsPapel = {
  titulo: string;            // "MESA 07" | "MOSTRADOR" | "DELIVERY 12"
  subtitulo?: string;        // "21:42 · COMANDA"
  local?: string;            // nombre del local arriba, en grande
  lineas: LineaPapel[];
  total?: number;            // centavos; si falta no se muestra la regla de total
  sello?: Sello;
  compacto?: boolean;        // densidad de la columna Entrando
  accionesLinea?: (l: LineaPapel) => React.ReactNode; // +/− en la carta y en Entrando
  children?: React.ReactNode; // pie: botones, ayuda, errores
  className?: string;
  'aria-label'?: string;
};
export function PapelComanda(p: PropsPapel): JSX.Element;
```
- `selloDeEstado`: `pendiente→ENVIADO/neutro`, `confirmado|cobrado→CONFIRMADO/ok`, `rechazado→RECHAZADO/mal`, `anulado→ANULADO/mal`.
- Marcado: `<article class="papel">` con `<header class="papel__cabeza">`, `<ol class="papel__lineas">` (cada `<li class="papel__linea">`: `<span class="papel__cant">2×</span>`, nombre en `<em class="papel__nombre">`, importe con `formatearPrecio`, detalle en `<span class="papel__detalle">`), `<p class="papel__total">`, sello `<span class="papel__sello papel__sello--{tono}" role="status">`. Línea `quitada` tachada.
- `papel.css`: fondo `var(--papel-fondo, #fff)`, tinta `var(--papel-tinta, #0b0b0b)`; perforación superior e inferior con `mask` (radial-gradient repetido de 10 px) sobre el propio papel, no un pseudo-elemento de color; líneas separadas por regla punteada; total con regla de 2 px; números en Azeret Mono tabular; nombres en `var(--papel-nombre-fuente, inherit)` itálica 800. Sello: borde 2 px, mayúscula espaciada, rotación −4°.

- [ ] **Step 1: Write the failing tests** en `PapelComanda.test.tsx`:
```tsx
it('muestra cantidad, nombre e importe de cada línea y el total', () => {
  render(<PapelComanda titulo="MESA 07" lineas={[{ id: 'a', cantidad: 2, nombre: 'Papas con cheddar', importe: 1600000 }]} total={1600000} />);
  expect(screen.getByText('2×')).toBeInTheDocument();
  expect(screen.getByText('Papas con cheddar')).toBeInTheDocument();
  expect(screen.getAllByText(formatearPrecio(1600000))).toHaveLength(2);
});
it('sin total no dibuja la regla de total', ...);            // queryByText(/total/i) === null
it('muestra el detalle (opciones y nota) bajo el nombre', ...);
it('el sello se anuncia como estado', ...);                  // getByRole('status') tiene 'CONFIRMADO'
it('una línea quitada queda tachada, no desaparece', ...);   // tiene clase papel__linea--quitada
it('nombres y notas de 140 caracteres no rompen la estructura', ...); // render sin throw, la línea contiene el texto completo
it.each([['pendiente','ENVIADO'],['confirmado','CONFIRMADO'],['cobrado','CONFIRMADO'],['rechazado','RECHAZADO'],['anulado','ANULADO']])('selloDeEstado(%s) = %s', ...);
```
- [ ] **Step 2:** Run `pnpm --filter @gula/ui test` → FAIL (no existe).
- [ ] **Step 3:** Implementar `sello.ts`, `PapelComanda.tsx`, `papel.css`; exportar desde `index.ts` (reemplaza `VERSION_UI`).
- [ ] **Step 4:** Run `pnpm --filter @gula/ui test` → PASS.
- [ ] **Step 5:** Commit `feat(ui): papel de comanda compartido con sellos de estado`.

### Task 3: Marca por local en `@gula/shared` + CLI

**Files:**
- Create: `packages/shared/src/marca.ts`, `packages/shared/src/marca.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/carta/src/marca.ts` (queda solo `estiloMarca`/`atributosTema`, importa `leerMarca` de shared), `apps/carta/src/marca.test.ts`, `apps/api/src/admin/cli.ts:12,60-75`, `infra/vps-nativo.md` (uso del comando)

**Interfaces:**
- Produces (shared):
```ts
export const TEMAS = ['comanda-bn'] as const;
export type Tema = (typeof TEMAS)[number];
export type ModoMarca = 'auto' | 'claro' | 'oscuro';
export type Marca = { tema: Tema; modo: ModoMarca; logo?: string; lema?: string; colorAcento?: string };
export function leerMarca(marca: unknown): Marca;   // nunca lanza; valores inválidos se descartan
export function validarCampoMarca(campo: 'tema'|'modo'|'logo'|'lema'|'color', valor: string): string | null; // mensaje de error o null
```
- Reglas: `tema` por defecto `comanda-bn`; `modo` por defecto `auto`; `logo` con la misma regex actual (`/^(\/[\w\-./]+|https:\/\/[\w\-.]+(:\d+)?\/[\w\-./%]*)$/`); `lema` texto recortado de 1–40 caracteres; `colorAcento` `#rrggbb`.
- Produces (carta): `atributosTema(m: Marca): { 'data-tema': Tema; 'data-modo': ModoMarca }`.
- CLI: `admin marca --slug <slug> [--tema comanda-bn] [--modo auto|claro|oscuro] [--lema 'est. 2024'] [--logo ...] [--color ...]`, cada valor validado con `validarCampoMarca` (error `DATOS_INVALIDOS` con el mensaje).

- [ ] **Step 1: Failing tests** (`marca.test.ts` en shared):
```ts
it('marca vacía → tema comanda-bn, modo auto, sin logo ni lema', () => expect(leerMarca({})).toEqual({ tema: 'comanda-bn', modo: 'auto' }));
it('descarta tema desconocido, modo inválido, logo javascript:, lema de 41 caracteres');
it('conserva colorAcento válido (compatibilidad)');
it('acepta lema "est. 2024" recortando espacios');
it('no lanza con null, string o array');
it('validarCampoMarca devuelve mensaje para valores inválidos y null para válidos');
```
- [ ] **Step 2:** Run `pnpm --filter @gula/shared test` → FAIL.
- [ ] **Step 3:** Implementar; mover los casos de `apps/carta/src/marca.test.ts` que siguen valiendo y agregar `atributosTema`.
- [ ] **Step 4:** Actualizar `marcaCli` y el texto de uso; documentar en `infra/vps-nativo.md`: `gula-admin marca --slug gula --tema comanda-bn --lema 'est. 2024' --logo /marcas/gula-hoja.svg`.
- [ ] **Step 5:** Run `pnpm --filter @gula/shared test && pnpm --filter @gula/carta test && pnpm --filter @gula/api typecheck` → PASS.
- [ ] **Step 6:** Commit `feat(marca): tema, lema y modo por local validados en shared`.

### Task 4: Carta: mundo "Comanda B/N", cabecera, categorías y filas

**Files:**
- Modify: `apps/carta/src/estilos.css` (reescritura completa), `apps/carta/src/main.tsx` (importar `@gula/ui/base.css`, `@gula/ui/fuentes-carta.css`, `@gula/ui/papel.css`), `apps/carta/index.html` (`theme-color` `#0b0b0b`, título `Carta`), `apps/carta/src/paginas/Carta.tsx`, `apps/carta/src/componentes/Categorias.tsx`, `apps/carta/src/componentes/ProductoCard.tsx`
- Create: `apps/carta/public/marcas/gula-hoja.svg` (hoja geométrica de una sola forma, `fill="#ffffff"`, viewBox 40×40: se apoya sobre la cabecera negra de la carta y sobre el riel negro de la caja; sin filtros), `apps/carta/src/componentes/useCategoriaActiva.ts`
- Test: `apps/carta/src/paginas/Carta.test.tsx`, `apps/carta/src/componentes/ProductoCard.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `leerMarca`, `atributosTema` (tarea 3).
- Produces: `useCategoriaActiva(ids: string[]): string | null` (IntersectionObserver sobre `#cat-<id>`; en jsdom devuelve el primero). `ProductoCard` recibe además `cantidadEnComanda: number` y `onAgregarRapido?: () => void` (solo si el producto no tiene grupos de opciones; si tiene, abre el detalle como hoy).
- Raíz de la carta: `<div className="carta" {...atributosTema(marca)} style={estiloMarca(marca)}>`. CSS: `[data-tema="comanda-bn"]` define los tokens; `[data-modo="oscuro"]` y `@media (prefers-color-scheme: dark) [data-modo="auto"]` invierten página y bandas (fondo `#0b0b0b`, bandas blancas con texto negro) dejando `--papel-fondo: #fff`.
- Cabecera: banda negra; logo (`<img>` con `marca.logo`, alto 34 px; sin logo, nada) + nombre del local (Archivo `wdth 125`, 900) + `marca.lema` si existe; sello de mesa `MESA` / número a la derecha si hay mesa.
- Categorías: `<nav aria-label="Categorías">` fija, texto en mayúscula condensada; la activa con `aria-current="true"` y subrayado de 3 px.
- Sección: `<h2>` como banda negra a todo el ancho (mayúscula, `wdth 72`, 900). Horario fuera de rango: sección con clase `seccion--fuera-de-horario` (filas apagadas, botones deshabilitados) y el horario visible.
- Fila: nombre `<h3>` itálica 800, descripción, precio en columna fija Azeret Mono, botón cuadrado 44 px `aria-label="Agregar {nombre}"`; con `cantidadEnComanda > 0` el botón se invierte y muestra el número (`aria-label="Agregar otro {nombre}, van {n}"`). Sin stock: clase `producto--sin-stock`, nombre y precio tachados, botón `disabled` con `aria-label="{nombre} sin stock"`, texto "Sin stock por hoy" en lugar de la descripción.

- [ ] **Step 1: Failing tests:**
```tsx
// ProductoCard.test.tsx
it('sin opciones: el + agrega directo y luego muestra la cantidad');
it('con opciones: el + abre el detalle (onAbrir) y no agrega');
it('sin stock: tachado, botón deshabilitado con etiqueta "X sin stock"');
// Carta.test.tsx (agregar)
it('muestra el lema y el logo de la marca cuando existen');
it('sin logo muestra solo el nombre del local');
it('la raíz lleva data-tema="comanda-bn" y data-modo');
it('entrando por QR muestra el sello MESA con el nombre de la mesa');
```
- [ ] **Step 2:** Run `pnpm --filter @gula/carta test` → FAIL.
- [ ] **Step 3:** Implementar marcado + `estilos.css` nuevo (borrar el anterior entero; nada de tokens crema). Leer `C:\Users\vtxal\.claude\skills\impeccable\reference\craft-floor.md` antes de editar. Aplicar **mobile-native**: `min-height: 100dvh`, `-webkit-tap-highlight-color: transparent`, `env(safe-area-inset-*)` en cabecera y papel fijo, inputs ≥ 16 px.
- [ ] **Step 4:** Run tests → PASS. Actualizar en los tests existentes solo textos/roles que cambiaron a propósito.
- [ ] **Step 5:** Verificar a ojo: `pnpm --filter @gula/carta dev` contra la API local (o fixtures) y `C:/Users/vtxal/.claude/skills/impeccable/scripts/impeccable shot http://localhost:5173/<slug>` a 375 px en claro y oscuro; corregir en un solo lote.
- [ ] **Step 6:** Commit `feat(carta): mundo La Comanda en cabecera, categorías y productos`.

### Task 5: Carta: detalle de producto

**Files:**
- Modify: `apps/carta/src/componentes/DetalleProducto.tsx`, `apps/carta/src/estilos.css`
- Test: `apps/carta/src/componentes/DetalleProducto.test.tsx`

**Interfaces:**
- Hoja inferior (mismo `useDialogo`): nombre itálica grande, descripción, precio; grupos como filas de ticket con casillas cuadradas propias (input nativo oculto accesible + recuadro dibujado), recargo alineado a la columna de precios, opción sin stock tachada y deshabilitada; nota (`<textarea>` 16 px, máx. actual); cantidad −/+ 44 px; botón negro a todo el ancho con texto exacto `Agregar a la comanda · {formatearPrecio(total)}`.

- [ ] **Step 1: Failing tests:** `it('el botón dice "Agregar a la comanda" con el total que incluye recargos y cantidad')`; `it('una nota de 140 caracteres se acepta y se ve completa')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm --filter @gula/carta test` → PASS.
- [ ] **Step 5:** Commit `feat(carta): detalle de producto como renglones de comanda`.

### Task 6: Carta: la comanda (papel fijo, papel abierto, envío con corte, talones)

**Files:**
- Modify: `apps/carta/src/componentes/Carrito.tsx`, `apps/carta/src/componentes/EstadoPedido.tsx`, `apps/carta/src/componentes/AvisosMesa.tsx`, `apps/carta/src/paginas/Carta.tsx`, `apps/carta/src/estilos.css`
- Test: `apps/carta/src/paginas/CartaMesa.test.tsx`, `apps/carta/src/componentes/EstadoPedido.test.tsx`

**Interfaces:**
- Consumes: `PapelComanda`, `selloDeEstado`, `LineaPapel` (tarea 2).
- Papel fijo (cerrado): botón a todo el ancho con aspecto de papel perforado, `aria-label="Ver mi pedido: {n} ítems, {total}"`, contenido `Comanda · {mesa}` / `{n} ítems` / `Ver mi pedido` / total. Solo con mesa que acepta pedidos y carrito no vacío; con carrito vacío no se muestra.
- Papel abierto: hoja inferior con `<PapelComanda local={nombre} titulo={mesa en mayúscula} subtitulo="{hh:mm} · COMANDA" lineas total accionesLinea={−/+/quitar}>`; el cuerpo de líneas hace scroll y el pie con el botón queda fijo (alto máx. `calc(100dvh - 72px)`). Pie: botón `Mandar a la barra` y ayuda `Lo que mandes sale impreso en la barra.`
- Envío: el botón se deshabilita mientras se envía (texto `Mandando…`). Si la API acepta → se agrega la clase `papel--cortando` (animación `--ui-dur-firma` con `--ui-curva-salida`: la mitad inferior baja un poco y el papel sale hacia arriba con `clip-path`/`transform`), al terminar (`animationend`, o inmediato con movimiento reducido) se vacía el carrito y se cierra. Si falla → no hay corte; error en `role="alert"` con el mensaje y botón `Reintentar`.
- Talones: `EstadoPedido` pasa a `<PapelComanda compacto titulo="PEDIDO" lineas sello={selloDeEstado(p.estado)}>` con ayuda: pendiente `Esperando que lo confirmen en la barra.`, rechazado `No pudimos tomar tu pedido: {motivo ?? 'consultá con la moza'}`, anulado `Tu pedido fue anulado. Consultá con la moza.`; se mantiene `aria-live="polite"` y la consulta cada 5 s.
- Avisos a la moza: dos botones de contorno 44 px (`Llamar a la moza`, `Pedir la cuenta`) sobre el papel fijo, con confirmación en línea como hoy.

- [ ] **Step 1: Failing tests:**
```tsx
it('el papel fijo muestra mesa, cantidad de ítems y total, y abre la comanda');
it('"Mandar a la barra" envía una sola vez aunque se toque dos veces');
it('si el envío falla, muestra el error y "Reintentar" y el carrito queda igual');
it('tras un envío aceptado se vacía la comanda y aparece el talón ENVIADO');
it('con 25 líneas el botón "Mandar a la barra" sigue en el documento y visible (no dentro del área con scroll)');
// EstadoPedido.test.tsx
it.each([['pendiente','ENVIADO'],['confirmado','CONFIRMADO'],['rechazado','RECHAZADO'],['anulado','ANULADO']])('talón con sello %s→%s');
```
(En jsdom, `matchMedia('(prefers-reduced-motion: reduce)')` → `true` en `test-setup.ts` para que el corte sea inmediato.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar. Diseñar la animación con la skill **animate** (un único gesto, interrumpible, solo `transform`/`clip-path`/`opacity`).
- [ ] **Step 4:** Run `pnpm --filter @gula/carta test` → PASS.
- [ ] **Step 5:** Captura a 375 px del papel cerrado, abierto con 3 y con 25 líneas, error y talones; corregir en lote.
- [ ] **Step 6:** Commit `feat(carta): comanda en papel con corte al mandar a la barra`.

### Task 7: Carta: estados de carga, error y entrada

**Files:**
- Modify: `apps/carta/src/paginas/Carta.tsx`, `apps/carta/src/main.tsx` (ruta `*`), `apps/carta/src/useCarta.ts` (solo exponer `reintentar(): void` si no existe), `apps/carta/src/estilos.css`
- Create: `apps/carta/src/componentes/EsqueletoCarta.tsx`
- Test: `apps/carta/src/paginas/Carta.test.tsx`

**Interfaces:**
- Cargando: `<EsqueletoCarta>` (banda de cabecera + 2 bandas + 4 filas en bloques sin animación de brillo; `aria-busy="true"` y texto oculto `Cargando la carta…`).
- Pantallas de aviso, todas con la cabecera negra del local cuando se conoce, o una banda neutra con "Carta" si no: no encontrado (`No encontramos este local.`), error de red (`No pudimos cargar la carta.` + botón `Reintentar`), QR inválido (texto actual), mesa no abierta (`Pedile a la moza que abra la mesa para pedir desde acá.` y la carta visible en solo lectura), sin mesa (`/:slug`: carta en solo lectura, sin papel fijo ni avisos), ruta `*` (`Escaneá el QR de tu mesa para ver la carta.`).

- [ ] **Step 1: Failing tests:** `it('error de red muestra "Reintentar" y al tocarlo vuelve a pedir la carta')`; `it('cargando expone aria-busy y el texto "Cargando la carta…"')`; `it('sin mesa no hay papel de comanda ni avisos')`; `it('mesa cerrada muestra la carta en solo lectura con el aviso')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm --filter @gula/carta test` → PASS.
- [ ] **Step 5:** Commit `feat(carta): estados de carga, error y entrada en el mundo La Comanda`.

### Task 8: Caja: mundo "Línea de colectivo", riel y cartel

**Files:**
- Modify: `apps/desktop/src/renderer/estilos.css` (reescritura completa), `apps/desktop/src/renderer/main.tsx` (importar `@gula/ui/base.css`, `fuentes-caja.css`, `papel.css`), `apps/desktop/src/renderer/pantallas/Shell.tsx`
- Create: `apps/desktop/src/renderer/secciones.ts`, `apps/desktop/src/renderer/secciones.test.ts`, `apps/desktop/src/renderer/componentes/Cartel.tsx`
- Test: `apps/desktop/src/renderer/App.test.tsx`

**Interfaces:**
- Produces:
```ts
export type Seccion = 'mesas' | 'delivery' | 'caja' | 'reportes' | 'carta' | 'impresion'; // mover el tipo desde Shell
export const SECCIONES: Record<Seccion, { nombre: string; color: string; placa: string; textoPlaca: string }>;
export function resumenMesas(mesas: MesaSalon[]): { placa: string; resumen: string };
// placa = cantidad de mesas; resumen p.ej. "9 abiertas · 1 pidió la cuenta · 2 pedidos sin atender" (omitir partes en 0; todo en 0 → "Todas libres")
export function Cartel(p: { seccion: Seccion; placa: string; resumen?: string; children?: React.ReactNode }): JSX.Element;
```
- Shell: grid `riel | cartel / riel | contenido | entrando`. Riel `<nav aria-label="Secciones">` con logo/nombre del local arriba, ítems con muestra de color 28×22 y nombre en mayúscula condensada; activo con fondo blanco y `aria-current="page"`; pie `GulaWeb · v{version}`. Cartel con fondo `SECCIONES[s].color`, placa, título, resumen y a la derecha `Conexion`, `AvisoSync`, `AvisoActualizacion`, impresora (`AvisoImpresion` compacto), usuario + `Cambiar usuario`. Con `sinAtender > 0` la `Alerta` vive en el cartel con rojo de estado y texto `{n} sin atender`.
- Placa por sección (criterio fijado): Mesas = total de mesas; Delivery = pedidos de delivery activos; Caja = `$` del saldo esperado si hay caja abierta, si no `—`; Reportes, Carta e Impresión llevan la inicial (`R`, `C`, `I`) en la placa.

- [ ] **Step 1: Failing tests:** `secciones.test.ts`: `it('resumenMesas cuenta abiertas, cuenta pedida y pendientes y omite ceros')`, `it('todas libres → "Todas libres"')`, `it('cada sección tiene color distinto y ninguno es el rojo o ámbar de estado')`. `App.test.tsx`: `it('el riel marca la sección activa con aria-current y el cartel muestra su nombre')`.
- [ ] **Step 2:** Run `pnpm --filter @gula/desktop test -- src/renderer` → FAIL.
- [ ] **Step 3:** Implementar; leer craft-floor antes. CSS nuevo desde cero (borrar crema/terracota). Modo oscuro de la caja: no en esta tarea.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(caja): riel y cartel de Línea de colectivo`.

### Task 9: Caja: login, elegir usuario/PIN, avisos y diálogos

**Files:**
- Modify: `pantallas/Login.tsx`, `pantallas/ElegirUsuario.tsx`, `componentes/Dialogo.tsx`, `componentes/Alerta.tsx`, `componentes/Conexion.tsx`, `componentes/AvisoSync.tsx`, `componentes/AvisoActualizacion.tsx`, `componentes/AvisoImpresion.tsx`, `estilos.css` (todo bajo `apps/desktop/src/renderer/`)
- Test: los `*.test.tsx` existentes de esos componentes

**Interfaces:**
- Login y elegir usuario sobre el riel negro a pantalla completa con la marca GulaWeb (wordmark en Barlow Condensed 800); usuarios como placas grandes (inicial en placa verde + nombre + rol); teclado PIN de teclas ≥ 64 px con dígitos tabulares. Diálogo: superficie blanca, título en mayúscula condensada, botones del pie a la derecha, foco atrapado como hoy. Conexión: punto + texto (`En línea` / `Sin conexión` en rojo de estado). Sin cambios de lógica.

- [ ] **Step 1:** Ajustar marcado y estilos.
- [ ] **Step 2:** Run `pnpm --filter @gula/desktop test -- src/renderer` → PASS (actualizar solo textos que cambiaron a propósito).
- [ ] **Step 3:** Commit `feat(caja): acceso, avisos y diálogos en el nuevo estilo`.

### Task 10: Caja: Mesas

**Files:**
- Modify: `apps/desktop/src/renderer/pantallas/Mesas.tsx`, `estilos.css`
- Create: `apps/desktop/src/renderer/pantallas/Mesas.test.tsx` (si no existe; si existe, ampliarlo)

**Interfaces:**
- Consumes: `estadoDe` actual (misma prioridad de estados), `Cartel`/`resumenMesas` (tarea 8).
- Grilla `repeat(auto-fill, minmax(168px, 1fr))`; módulo: placa con número/nombre (Barlow Condensed 800, 38 px; nombres largos como "Patio 12" pasan a 26 px y envuelven), estado en mayúscula, detalle. Clases por tono: `mesa--libre` (borde punteado, sin placa), `mesa--abierta` (placa verde/crema), `mesa--pendiente` (placa y borde rojos), `mesa--aviso`, `mesa--cuenta` (ámbar). Filtros nuevos sobre la grilla: `Todas` / `Abiertas` / `Libres` (estado local, botones con `aria-pressed`), y `+ Pedido de mostrador` como botón principal verde. Pedidos de mostrador por cobrar: fila de papeles compactos bajo los filtros (como hoy, nuevo estilo).

- [ ] **Step 1: Failing tests:** `it('filtro "Libres" muestra solo mesas sin sesión')`; `it('cada mesa muestra su estado en texto')`; `it('30 mesas con nombres largos se renderizan todas con su nombre completo')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run → PASS. Captura a 1366×768 con las 14 mesas de `fixturasSalon.ts`: entran sin scroll junto a la columna Entrando.
- [ ] **Step 5:** Commit `feat(caja): salón con placas de mesa y filtros`.

### Task 11: Caja: columna "Entrando" con el papel de comanda

**Files:**
- Modify: `apps/desktop/src/renderer/componentes/Pendientes.tsx`, `pantallas/Shell.tsx`, `estilos.css`
- Test: tests existentes de Pendientes / `App.test.tsx`

**Interfaces:**
- Consumes: `PapelComanda`, `LineaPapel` (tarea 2).
- `Pendientes` se renderiza en el área `entrando` del Shell: título `ENTRANDO` con contador rojo; primero los avisos como filas compactas (`Mesa 4 · Llamó a la moza · 21:40` con botón `Atendido`, tono ámbar para cuenta), después cada pedido como `<PapelComanda compacto titulo={mesa en mayúscula} subtitulo={hora} lineas accionesLinea={−/+} total>` con pie `Aceptar e imprimir` (principal, tinta) / `Rechazar` (abre motivo con las sugerencias actuales). Lógica de ajuste/aceptar/rechazar intacta. Sin nada entrando: `Nada entrando por ahora.` (la columna siempre visible en Mesas; en otras secciones solo si hay algo).

- [ ] **Step 1: Failing test:** `it('un pedido pendiente aparece como papel con su mesa, líneas y "Aceptar e imprimir"')`; `it('sin pendientes en Mesas muestra "Nada entrando por ahora."')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm --filter @gula/desktop test -- src/renderer` → PASS.
- [ ] **Step 5:** Commit `feat(caja): pedidos entrantes como el mismo papel que manda el cliente`.

### Task 12: Caja: detalle de mesa, tomar pedido, cobrar y anular

**Files:**
- Modify: `pantallas/DetalleMesa.tsx`, `componentes/TomarPedido.tsx`, `componentes/Cobrar.tsx`, `componentes/Anular.tsx`, `estilos.css`
- Test: `componentes/Anular.test.tsx` y tests existentes

**Interfaces:**
- Detalle de mesa ocupa toda el área de trabajo: cartel muestra la mesa en la placa (`Cartel` con `placa={mesa.nombre}`); pedidos de la mesa como `PapelComanda` con `sello={selloDeEstado(estado)}` (anulados quedan visibles con sello ANULADO); acciones de mesa a la derecha.
- Tomar pedido: carta en columnas densas (categoría como banda condensada, productos como botones de una línea nombre + precio tabular) y `PapelComanda` en armado a la derecha con `Enviar`.
- Cobrar: diálogo con total grande tabular, métodos como botones grandes con `aria-pressed`, vuelto calculado; sin cambios de lógica.

- [ ] **Step 1: Failing test:** `it('un pedido anulado sigue en el detalle con el sello ANULADO')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(caja): mesa, pedido y cobro en el nuevo estilo`.

### Task 13: Logo del local en la caja

**Files:**
- Modify: `apps/api/src/auth/servicio.ts:65,147` (agregar `logo: leerMarca(l.marca).logo ?? null` a `local`), `apps/desktop/src/compartido/ipc.ts:14` (`LocalInfo = { id; nombre; slug; logo?: string | null }`), donde main arma `LocalInfo` desde la respuesta de login/quienSoy (buscar con `grep -rn "slug:" apps/desktop/src/main`), `pantallas/Shell.tsx` (riel)
- Test: test de API de auth existente (agregar caso) y `App.test.tsx`

**Interfaces:**
- Consumes: `leerMarca` (tarea 3).
- En el riel: si `logo` existe, `<img src={new URL(logo, servidorBase).href} alt="" onError={ocultar}>` (un logo relativo se resuelve contra el origen del servidor configurado), alto 28 px, tal cual sobre el riel negro (los logos de marca van pensados para fondo oscuro, igual que en la cabecera de la carta). Sin logo: solo el nombre. Sesiones guardadas viejas sin `logo` siguen funcionando.

- [ ] **Step 1: Failing tests:** API: `it('login devuelve el logo de la marca del local, o null')`. Renderer: `it('sin logo el riel muestra solo el nombre del local')`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `pnpm --filter @gula/api test -- auth && pnpm --filter @gula/desktop test -- src/renderer` → PASS.
- [ ] **Step 5:** Commit `feat(caja): logo del local en el riel`.

### Task 14: Caja: Delivery, Caja, Reportes, Carta, Impresión y vista previa

**Files:**
- Modify: `pantallas/Delivery.tsx`, `componentes/NuevoDelivery.tsx`, `pantallas/Caja.tsx`, `pantallas/Reportes.tsx`, `pantallas/Carta.tsx`, `componentes/EditorProducto.tsx`, `pantallas/Impresion.tsx`, `componentes/Ticket.tsx`, `componentes/VistaPrevia.tsx`, `estilos.css`
- Test: tests existentes de esas pantallas

**Interfaces:**
- Cada pantalla con su `Cartel` (color de su sección) y su placa según tarea 8.
- Delivery: pedidos como `PapelComanda` compactos en columnas por estado; Caja: movimientos en tabla con importes tabulares alineados a la derecha, ingresos/egresos con signo y texto (no solo color); Reportes: seguir la skill **dataviz** (paleta derivada del bordó de la sección, tooltips, estados vacíos); Carta (editor): lista densa con disponible/sin stock como interruptor con texto.
- `Ticket` conserva `maquetar` (lo que sale de la térmica) y se envuelve con la clase `papel` de `@gula/ui/papel.css` (perforación y sombra), ancho en `ch` como hoy.

- [ ] **Step 1:** Implementar pantalla por pantalla.
- [ ] **Step 2:** Run `pnpm --filter @gula/desktop test -- src/renderer` → PASS.
- [ ] **Step 3:** Capturas 1366×768 y 1920×1080 de cada sección; corregir en lote.
- [ ] **Step 4:** Commit `feat(caja): delivery, caja, reportes, carta e impresión en Línea de colectivo`.

### Task 15: Prueba de esfuerzo, cierre de diseño y publicación

**Files:**
- Create: `DESIGN.md`, `.impeccable/design.json`, surface briefs vía `impeccable surface-brief write` para `apps/carta` y `apps/desktop`
- Modify: lo que salga de las pruebas; `apps/desktop/package.json` (versión `0.2.0`)

- [ ] **Step 1:** Skill **break-ui** sobre la carta (fila, papel abierto) y la caja (Mesas, Entrando) con: nombres de 60 caracteres, notas de 140, 30 líneas, importes de `$ 9.999.999`, 0 productos en una categoría, 30 mesas. Arreglar lo que rompa.
- [ ] **Step 2:** `C:/Users/vtxal/.claude/skills/impeccable/scripts/impeccable detect --json --changed` desde la raíz; arreglar lo mecánico.
- [ ] **Step 3:** Revisión final en el propio hilo con `C:\Users\vtxal\.claude\skills\impeccable\reference\degraded\finish-reviewer.md` (sin subagente revisor, por preferencia del usuario) contra las capturas y la spec; corregir en un lote.
- [ ] **Step 4:** Escribir `DESIGN.md` + `.impeccable/design.json` desde lo construido siguiendo `reference/degraded/documenter.md` y `reference/document.md`.
- [ ] **Step 5:** `pnpm test && pnpm typecheck && pnpm lint` en la raíz → todo PASS; `pnpm --filter @gula/desktop e2e` → PASS.
- [ ] **Step 6:** Commit `docs(diseño): DESIGN.md del sistema construido`.
- [ ] **Step 7 (con OK del usuario):** Desplegar la carta en el VPS (`infra/vps-nativo.md`), correr `gula-admin marca --slug gula --tema comanda-bn --lema 'est. 2024' --logo /marcas/gula-hoja.svg`, y publicar la caja 0.2.0 por auto-actualización con el procedimiento existente. Probar QR → PC en producción.
