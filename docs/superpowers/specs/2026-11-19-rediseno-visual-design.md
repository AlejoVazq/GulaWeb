# GulaWeb: rediseño visual (carta + caja)

Fecha: 2026-11-19 · Estado: borrador para aprobar

## 1. Intención y por qué

El producto ya funciona en producción (vaztech.com.ar). Falta que **se vea terminado y propio**: hoy la carta tiene estilos mínimos y la caja un look crema + terracota genérico (el que delata "hecho con IA"). El objetivo inmediato es que **le guste al dueño de Gula** cuando se le presente; después se piensa en otros locales. En el pitch se muestran **las dos piezas por igual**: el dueño escanea el QR, ve su carta, pide, y el pedido entra en vivo en la PC y sale por la térmica.

Contexto de producto en `PRODUCT.md` (raíz). Diseño general del sistema en `docs/superpowers/specs/2026-11-18-gulaweb-design.md`.

## 2. Objetivos

- **Carta (celular del cliente)** con la dirección **"La Comanda"**, vestida con la identidad de cada local mediante temas por local (opción A). Gula primero.
- **Caja (Electron)** con la dirección **"Línea de colectivo"**: estilo propio de GulaWeb, igual para todos los locales; solo cambian nombre y logo del local.
- El **papel de comanda** es un único componente compartido: el que arma el cliente, el que llega a la PC y la vista previa de impresión salen del mismo código.
- Todas las pantallas y estados existentes rediseñados (no solo la pantalla principal).

## 3. No objetivos

- Funcionalidad nueva de negocio (estados de cocina, cobro online, fotos obligatorias, editor de temas en la UI).
- Página de venta de GulaWeb a otros locales.
- Cambiar flujos, permisos, sync o impresión ESC/POS (solo su presentación en pantalla).

## 4. Anti-objetivos (fracaso aunque se vea "lindo")

- Que parezca plantilla o "hecho con IA": crema + serif + terracota, tarjetas iguales con ícono, neón sobre negro, eyebrows sobre títulos, gradientes de texto.
- Que la identidad tape la tarea: un cliente tiene que poder pedir sin pensar; el personal tiene que ver el salón de reojo.
- Que un estado se comunique solo con color.
- Que sumar un local requiera tocar código o que un local pueda armarse un tema feo.
- Huecos grises por falta de fotos: el diseño tiene que verse completo sin ninguna.

## 5. Restricciones

- React 19 + CSS plano (sin Tailwind ni librerías de UI). Carta en Vite 6, caja en electron-vite.
- Carta rápida con mala señal: tipografías auto-alojadas, subconjunto latino, `font-display: swap`, presupuesto chico.
- Español rioplatense, ARS, tabulares en importes.
- Accesibilidad: contraste ≥ 4.5:1 en texto, objetivos táctiles ≥ 44 px, foco visible, `prefers-reduced-motion` respetado, roles/aria actuales conservados.
- Los tests existentes (vitest + Playwright humo) siguen pasando; se actualizan solo selectores o textos que el rediseño cambie a propósito.
- No hay logo de Gula en archivo ni fotos: se usa una **hoja provisoria** (SVG) reemplazable por configuración.

## 6. Enfoques considerados

| Enfoque | Trade-off | Decisión |
|---|---|---|
| Rehacer cada app por separado | Lo más rápido; el papel de comanda queda duplicado y carta/PC terminan divergiendo. | Descartado |
| **`packages/ui` chico (papel de comanda, tipografías, base de foco/movimiento) + cada app con su mundo** | Lo compartido no puede divergir; cada app conserva su estilo opuesto a propósito. Un paquete más en el monorepo. | **Elegido** |
| Sistema de diseño completo compartido | Mucho trabajo para atar dos mundos que deben ser distintos. | Descartado |

Temas por local: **temas prearmados + pocos ajustes** (logo, nombre, lema, modo) en lugar de tokens libres. Elegido porque garantiza calidad al revender: no se pueden combinar cosas que se vean mal.

Direcciones visuales: elegidas por el usuario en el navegador entre tres + la estándar del rubro, cada una (mockups en `.superpowers/brainstorm/…/direcciones-carta.html` y `direcciones-caja.html`).

## 7. Carta: "La Comanda"

**Idea.** La carta es el talonario de comandas del local. Lo que el cliente elige se va escribiendo en el papelito de su mesa; al mandarlo, se corta por la perforación y sale impreso en la barra. Rechaza la app de delivery con fotos y tarjetas.

**Mundo (tema "Comanda B/N", el de Gula).**
- Blanco y negro puro; gris solo donde lo exige la legibilidad (descripciones). Elegido = invertido a negro.
- Títulos de categoría en mayúscula condensada sobre **bandas negras** de ancho completo.
- Nombres de producto en **itálica bold**; descripción en regular; precio en columna fija con tipografía de ticket (tabular), alineado como un ticket.
- Cabecera: banda negra con logo (hoja provisoria), nombre del local en extendida black, lema ("est. 2024"), y **sello de mesa** (MESA / 07) cuando se entra por QR.
- Tipografías de referencia del mockup: Archivo (anchos variables, itálica) + Azeret Mono para cifras. El constructor puede ajustar si encuentra algo mejor que respete el carácter; no usar las de la lista negra de impeccable.

**Primera vista (celular).** Cabecera → pestañas de categorías fijas al hacer scroll (texto en mayúscula, la activa subrayada gruesa, se actualiza con el scroll) → secciones con banda + filas de producto. Abajo, fijo, el **papel de comanda** con borde perforado: "Comanda · Mesa 07 · N ítems", "Ver mi pedido", total.

**Filas de producto.** Nombre, precio, botón cuadrado "+" (44 px). Al agregar, el botón se invierte a negro y muestra la cantidad. Productos con opciones abren el detalle. **Sin stock**: tachado y apagado, botón deshabilitado punteado; no se oculta. Con foto (si algún día hay): miniatura opcional que no rompe la grilla sin ella.

**Detalle de producto** (hoja inferior): nombre en itálica grande, descripción, precio, grupos de opciones como filas de ticket con casillas cuadradas, nota libre, cantidad, botón negro "Agregar a la comanda · $ X". Errores de validación en línea.

**Comanda abierta** (hoja inferior sobre fondo oscurecido): el papel de comanda completo — encabezado con nombre del local, MESA · hora · COMANDA, líneas `2× Nombre importe` con opciones y nota debajo, total con regla gruesa. Cantidades editables y quitar. Botón **"Mandar a la barra"**. Línea de ayuda: lo que mandes sale impreso en la barra.

**Momento firma (la única animación protagonista).** Al mandar: el papel se corta por la perforación y sube/sale; queda el talón con el número de pedido. Duración corta (≈ 400–600 ms), ease-out, interrumpible; con `prefers-reduced-motion` se reemplaza por un cambio instantáneo + sello.

**Estados del pedido (los reales del sistema).** El talón muestra un sello según `PedidoPublico.estado`:
- `pendiente` → **ENVIADO** "Esperando que lo confirmen en la barra".
- `confirmado` / `cobrado` → **CONFIRMADO**.
- `rechazado` → **RECHAZADO** + motivo.
- `anulado` → **ANULADO**.
Nota: el mockup mostraba "En cocina / Listo"; esos estados **no existen** y quedan fuera de alcance (ver §3).

**Demás estados de la carta.** Cargando (esqueleto de bandas y filas, no spinner), local no encontrado, error de red con reintentar, QR inválido, mesa no abierta ("Pedile a la moza que abra la mesa"), entrada sin mesa (`/:slug`: carta de solo lectura, sin papel de comanda), pedidos ya enviados de la mesa (lista de talones), avisos a la moza (llamar / pedir la cuenta) como botones de contorno junto al papel, con confirmación en línea. Categorías con horario: se muestran con su horario y, fuera de él, apagadas como sin stock.

**Modo noche.** Con `prefers-color-scheme: dark`: fondo negro, texto blanco, bandas blancas con texto negro; el **papel de comanda sigue siendo blanco** (es papel). Elección del constructor: si un tema lo define, el local puede fijar claro u oscuro.

## 8. Caja: "Línea de colectivo"

**Idea.** Cada sección es una "línea" con su color, como los colectivos de Buenos Aires. El cartel superior toma el color de la sección y lleva un número grande en placa (como el número de línea): se sabe dónde se está sin leer. Rechaza el POS gris con un azul de acento.

**Mundo.**
- Riel lateral negro (tinta) con el logo + nombre del local arriba, secciones con su muestra de color, versión de GulaWeb al pie.
- Colores de sección a toda saturación, sin medias tintas: Mesas verde (`#16583d`, placa crema `#efe3bf`), Delivery cobalto (`#1c4c97`), Caja ocre (`#d79a17`, texto oscuro), Reportes bordó (`#6e1c38`), Carta petróleo (`#11606b`), Impresión grafito. Valores del mockup; el constructor los afina para contraste.
- Colores de estado reservados, distintos de los de sección: **urgente** rojo (`#d8361b`: pedido nuevo, error, sin conexión), **cuenta** ámbar (`#f0b429`), ok verde claro para conexión.
- Fondo de trabajo gris verdoso claro (`#eef0ec`), módulos blancos con borde fino. Nada de crema.
- Tipografía: condensada en mayúsculas (Barlow Condensed en el mockup) para carteles, secciones y números de mesa; sans de trabajo (Barlow) para el resto; tabulares para plata.
- Cada pantalla muestra **un solo** color de sección (en el cartel y el ítem activo del riel); el resto es neutro.

**Cartel (cabecera).** Placa con número/cifra clave de la sección (Mesas: cantidad de mesas; el constructor define la cifra de cada sección), título en mayúscula, resumen en una línea ("9 abiertas · 1 pidió la cuenta · 2 pedidos sin atender"), y a la derecha: conexión, estado de impresora, sync, actualización, usuario + "Cambiar usuario". Con pedidos sin atender, la alerta actual sigue existiendo en este lenguaje (rojo de estado, con texto y cantidad).

**Mesas.** Grilla de módulos: número grande condensado en placa + estado en mayúscula + detalle (personas · minutos, o importe si pidió la cuenta). Vocabulario fijo: **Libre** (borde punteado, sin placa), **Abierta** (placa del color de sección), **Pedido nuevo** (placa y borde rojos), **Llamó a la moza**, **Pidió la cuenta** (ámbar). Siempre texto, nunca solo color. Las 14 mesas de Gula entran sin scroll a 1366×768. Filtros arriba y "+ Pedido de mostrador".

**Columna "Entrando".** A la derecha, los pedidos pendientes llegan como **el mismo papel de comanda** del cliente (componente compartido), con "Aceptar e imprimir" / "Rechazar". Este es el momento firma de la caja: lo que mandó el cliente aparece igual y sale por la térmica. Reemplaza visualmente a `Pendientes` sin cambiar su lógica.

**Detalle de mesa / tomar pedido / cobrar.** Al abrir una mesa, el detalle ocupa toda el área de trabajo (una cosa por vez). Pedidos de la mesa como papeles de comanda; tomar pedido con la carta en columnas densas y la comanda en armado al costado; cobrar como diálogo con métodos de pago y totales tabulares. Anulaciones con motivo visibles como sello "ANULADO" (no desaparecen).

**Resto de pantallas**, todas en el mismo lenguaje: Login, Elegir usuario + PIN (teclas grandes), Delivery, Caja (apertura, movimientos, cierre), Reportes (con la guía `dataviz` para gráficos), Carta (editor), Impresión, Vista previa de ticket (papel de comanda en ancho 80 mm), avisos de sync/actualización/impresión, diálogos y errores.

**Modo oscuro.** Elección del constructor si sobra tiempo; no es requisito. El riel y los carteles ya son oscuros/saturados.

## 9. Piezas compartidas (`packages/ui`)

- **`<PapelComanda>`**: encabezado (local, mesa, hora, título), líneas (cantidad, nombre en itálica, importe, opciones/nota), total, borde perforado superior/inferior, variantes: `armando` (editable, carta), `entrante` (con acciones, caja), `talon` (con sello de estado), `impresion` (vista previa 80 mm). Solo presentación: recibe datos ya calculados con `@gula/shared`.
- Tipografías auto-alojadas (woff2 subconjunto latino) y sus `@font-face`.
- Base común: foco visible, `::selection`, tabulares, curvas y duraciones, regla de movimiento reducido.
- Sin tokens de color de ningún mundo: cada app define los suyos.

## 10. Temas por local

- `locales.marca` (JSON existente) se amplía, validado en `leerMarca` y en la API:
  - `tema`: id de tema prearmado (por ahora solo `comanda-bn`; diseñado para sumar otros).
  - `logo`: como hoy (ruta propia o https). Si falta, se usa el nombre del local en la tipografía del tema; la hoja provisoria se carga como logo de Gula.
  - `lema`: texto corto opcional ("est. 2024").
  - `modo`: `auto` | `claro` | `oscuro` (opcional).
  - `colorAcento` se conserva por compatibilidad, pero el tema decide si lo usa.
- El tema se aplica con variables CSS + un atributo `data-tema` en la raíz de la carta.
- `admin marca` del CLI suma `--tema`, `--lema`, `--modo`.
- La caja muestra nombre + logo del local en el riel (si el logo no llega hoy a la sesión de escritorio, el constructor lo resuelve; sin logo, solo el nombre).

## 11. Proceso y calidad

- Diseño con el skill **impeccable** (hook de diseño ya activo) y el piso de oficio (`craft-floor`); verificación mirando capturas a 375 px (carta) y 1366×768 / 1920×1080 (caja).
- Movimiento con **animate**/**emil-design-eng** (un solo gesto protagonista por app, el resto funcional), **mobile-native** para la carta (100dvh, tap highlight, safe areas, sin zoom en inputs), **break-ui** con datos extremos (nombres largos, 30 ítems, importes grandes, 0 productos en una categoría).
- Al terminar: revisión de impeccable y documentación `DESIGN.md` del sistema construido; luego la auditoría completa (autorrevisión, sin subagente revisor).
- Despliegue: carta en el VPS + nueva versión de escritorio por auto-actualización (procedimiento existente).

## 12. Decisiones tomadas en la revisión del documento (criterio de Claude, corregibles)

- **El corte** se anima recién cuando la API acepta el pedido; si falla el envío, el papel queda entero con el error en línea y "Reintentar".
- **Impreso vs pantalla:** el ticket ESC/POS no se rediseña; el papel en pantalla replica su estructura (orden y campos de cada línea), por eso el texto dice "sale impreso en la barra", no "igual".
- **Avisos en "Entrando"** (llamó a la moza, pidió la cuenta) van como filas compactas con color de estado encima de los papeles de pedido, no como papeles.
- **Pantalla de referencia de la caja:** 1366×768 como mínimo cómodo; 1920×1080 como amplia.
- **Logo provisorio de Gula:** hoja SVG geométrica dibujada para el proyecto, cargada como `marca.logo` de Gula, reemplazable cuando llegue el archivo real.

## 13. Lo que queda a criterio del constructor

- Tipografías finales dentro del carácter descrito, valores exactos de color/espaciado, cifra de la placa de cada sección.
- Forma exacta de esqueletos de carga y de la animación de corte, dentro de los límites dados.
- Orden de las pantallas secundarias de la caja.
- Modo oscuro de la caja.
