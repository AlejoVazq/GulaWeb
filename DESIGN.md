---
name: GulaWeb
description: Carta QR y caja de un bar porteño que hablan el mismo papel de comanda.
colors:
  tinta: "#0b0b0b"
  papel: "#ffffff"
  carta-pagina: "#fbfaf7"
  carta-texto-suave: "#3d3c39"
  carta-regla: "#d8d6d0"
  carta-mal: "#b3261e"
  riel: "#15171a"
  suelo: "#eef0ec"
  superficie: "#ffffff"
  superficie-2: "#f6f7f4"
  caja-texto-suave: "#4b5057"
  borde: "#d3d6cf"
  borde-fuerte: "#a9aea5"
  linea-mesas: "#16583d"
  placa-mesas: "#efe3bf"
  linea-delivery: "#1c4c97"
  linea-caja: "#d79a17"
  linea-reportes: "#6e1c38"
  dato-reportes: "#a3375b"
  linea-carta: "#11606b"
  linea-impresion: "#3d4249"
  urgente: "#d8361b"
  urgente-suave: "#fbe6e1"
  cuenta: "#f0b429"
  cuenta-suave: "#fdf2d6"
  ok: "#1f7a46"
  ok-claro: "#6fe29a"
typography:
  carta-cabecera:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 900
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 125"
  carta-banda:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 900
    letterSpacing: "0.05em"
    fontVariation: "'wdth' 72"
  carta-producto:
    fontFamily: "Archivo Variable, Arial Narrow, sans-serif"
    fontSize: "1.07rem"
    fontWeight: 800
    letterSpacing: "-0.01em"
  caja-cartel:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.05em"
  caja-placa:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "2.3rem"
    fontWeight: 800
    lineHeight: 1
  caja-titulo:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 700
    letterSpacing: "0.05em"
  caja-cuerpo:
    fontFamily: "Barlow, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  cifras:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontWeight: 600
    fontFeature: "'tnum'"
rounded:
  ninguno: "0px"
  placa: "4px"
  chico: "6px"
  modulo: "8px"
spacing:
  e1: "4px"
  e2: "8px"
  e3: "12px"
  e4: "16px"
  e6: "24px"
  carta-gutter: "18px"
components:
  caja-boton:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.riel}"
    rounded: "{rounded.chico}"
    height: "40px"
    padding: "0 16px"
  caja-boton-principal:
    backgroundColor: "{colors.riel}"
    textColor: "{colors.papel}"
    rounded: "{rounded.chico}"
    height: "40px"
  caja-boton-linea-mesas:
    backgroundColor: "{colors.linea-mesas}"
    textColor: "{colors.papel}"
    rounded: "{rounded.chico}"
    height: "40px"
  caja-modulo:
    backgroundColor: "{colors.superficie}"
    rounded: "{rounded.modulo}"
    padding: "16px"
  caja-placa-mesa-abierta:
    backgroundColor: "{colors.linea-mesas}"
    textColor: "{colors.placa-mesas}"
    typography: "{typography.caja-placa}"
    rounded: "{rounded.placa}"
  carta-boton-agregar:
    backgroundColor: "{colors.carta-pagina}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.ninguno}"
    size: "44px"
  carta-boton-mandar:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.ninguno}"
    height: "52px"
---

# Design System: GulaWeb

## Overview

**Creative North Star: "El mismo papel"**

GulaWeb son dos mundos unidos por un objeto. La carta del cliente es **La Comanda**: el talonario de Gula en blanco y negro puro, bandas negras con mayúsculas anchas, nombres en itálica gruesa y precios en tipografía de ticket. La caja es **Línea de colectivo**: cada sección es una línea con su color a toda saturación (como los colectivos de Buenos Aires), un riel negro a la izquierda y un cartel con una placa grande que dice dónde se está sin leer. Lo que los une es el **papel de comanda** (`@gula/ui`): lo que arma el cliente en la mesa, lo que entra a la caja en la columna "Entrando", lo que se ve en el detalle de mesa y la vista previa de impresión son el mismo papel perforado, con las mismas líneas y el mismo orden que el ticket térmico.

La densidad es de herramienta de trabajo en la caja (14 mesas en una pantalla de 1366×768, sin scroll) y de carta de bar en el celular (una columna, un pulgar). Ninguno de los dos mundos usa crema ni terracota, grises de relleno ni tarjetas con sombra blanda: el blanco es papel y el negro es tinta.

**Key Characteristics:**
- Un objeto compartido (el papel perforado) en lugar de un "estilo de marca" compartido.
- Carta: blanco y negro, selección invertida, gris solo en descripciones.
- Caja: un color de sección por pantalla (cartel y riel); el área de trabajo es neutra.
- Rojo y ámbar reservados para estados; nunca son color de sección.
- Toda la plata en cifras tabulares monoespaciadas.

## Colors

Dos paletas que no se mezclan: la carta es tinta sobre papel; la caja es un suelo gris verdoso con seis líneas saturadas y dos colores de estado.

### Primary
- **Tinta** (tinta): texto, bandas de categoría, cabecera del local, botón "Mandar a la barra" y todo lo seleccionado en la carta (seleccionar es invertir a negro).
- **Riel** (riel): el riel lateral de la caja, el botón principal neutro y la franja de "Efectivo esperado".

### Secondary
- **Líneas de sección** (linea-mesas verde, linea-delivery cobalto, linea-caja ocre, linea-reportes bordó, linea-carta petróleo, linea-impresion grafito): pintan el cartel y la muestra del riel de su sección, y la acción que avanza el trabajo en esa sección ("Pedido de mostrador", "Salió", "Nuevo producto", "Abrir caja"). Sobre ocre el texto va en tinta; sobre las demás, en blanco.
- **Placa crema de Mesas** (placa-mesas): la placa del cartel de Mesas y el número de una mesa abierta sobre verde. Es el único crema del sistema y vive siempre sobre verde.
- **Dato de Reportes** (dato-reportes): el bordó un paso más claro con el que se dibujan barras y columnas; al señalar una columna vuelve al bordó de la línea.

### Tertiary
- **Urgente** (urgente / urgente-suave): pedido nuevo, error, sin conexión, egresos y variaciones malas.
- **Cuenta** (cuenta / cuenta-suave): pidió la cuenta, "A cobrar", "Sin impresora elegida".
- **Ok** (ok / ok-claro): cobrado, en línea, impresora lista, variaciones buenas.

### Neutral
- **Página de la carta** (carta-pagina): el fondo detrás del papel; en modo noche pasa a tinta y el papel sigue blanco.
- **Suelo** (suelo): el fondo de trabajo de la caja; sobre él, **Superficie** (superficie) para módulos y **Superficie 2** (superficie-2) para cabeceras de tabla e interruptores apagados.
- **Bordes** (borde, borde-fuerte): un pelo de 1px alrededor de módulos; el fuerte para controles y bordes punteados de mesas libres.
- **Texto suave** (carta-texto-suave, caja-texto-suave): descripciones, rótulos y horas.

### Named Rules
**La regla de una sola línea.** Cada pantalla de la caja muestra un único color de sección: en el cartel, en la muestra activa del riel y, como mucho, en un botón que avanza el trabajo. Todo lo demás es neutro.

**La regla de los colores de estado.** Rojo y ámbar significan algo (urgente, cuenta). No se usan como decoración ni como color de sección, y nunca van solos: siempre llevan texto ("Pedido nuevo", "A cobrar", "Faltan $ 500").

**La regla de la tinta.** En la carta no hay grises de relleno: seleccionado es invertido a negro, sin stock es tachado y apagado, nunca escondido.

## Typography

**Carta:** Archivo Variable (eje de ancho 62–125, romana e itálica) con Azeret Mono para cifras.
**Caja:** Barlow (400–700) para trabajar, Barlow Condensed (600–800) para carteles, placas y títulos, Azeret Mono para cifras.

**Character:** la carta habla con el ancho de una sola familia: expandida en la cabecera, comprimida en las bandas, itálica gruesa en los nombres. La caja habla como la señalética del transporte: condensada, mayúscula, legible de reojo.

### Hierarchy
- **Cabecera de la carta** (carta-cabecera): nombre del local, expandido, sobre la banda negra.
- **Banda de categoría** (carta-banda): mayúscula comprimida, blanco sobre tinta, con `text-wrap: balance`.
- **Nombre de producto** (carta-producto): itálica 800; envuelve, nunca se corta.
- **Cartel de la caja** (caja-cartel): nombre de la sección; debajo, el resumen en Barlow 0.85rem.
- **Placa de mesa** (caja-placa): el número de la mesa; un nombre con número ("Patio cubierto 12") lleva el número en la placa y el lugar como rótulo; uno sin número envuelve por palabras a 1.15rem.
- **Títulos de módulo y columna** (caja-titulo): mayúscula condensada con un contador en placa de tinta.
- **Cuerpo de la caja** (caja-cuerpo): formularios, tablas, detalle.
- **Cifras** (cifras): toda la plata, horas y cantidades; tabulares en columnas. La cifra principal de Reportes (Ventas, 3.25rem) y las fichas van en Barlow 600 con cifras proporcionales.

### Named Rules
**La regla de los 11 píxeles.** Ningún texto funcional baja de 11px; las notas de renglón del papel compacto van a 12px.

**La regla de la plata tabular.** Todo importe se escribe con `formatearPrecio` y en cifras tabulares; nunca se trunca.

## Layout

**Carta** (celular primero): una columna con un margen de 18px; cabecera negra, pestañas de categoría pegadas arriba (una pestaña larga se corta con puntos suspensivos y se lee entera en su banda), filas de producto con nombre a la izquierda y columna fija de precio y botón a la derecha, y el papel de la comanda fijo abajo (76px) que se abre a pantalla completa con scroll interno y "Mandar a la barra" siempre visible. Respeta `100dvh` y las zonas seguras.

**Caja** (1366×768 cómodo, 1920×1080 amplio): grilla `riel | cartel / riel | contenido | entrando`. El riel mide 184px; la columna Entrando, unos 320px, siempre visible en Mesas y en las demás secciones solo si hay algo sin atender. El contenido usa módulos en grillas `auto-fill` (mesas de 168px como mínimo, papeles de delivery de 250px, gráficos de 340px). Caja e Impresión van a dos columnas y pasan a una por debajo de 1240px. Abrir una mesa o editar un producto ocupa el área de trabajo: una cosa por vez.

Ritmo: pasos de 4, 8, 12, 16 y 24px (e1–e6).

## Elevation & Depth

Plano por defecto. La profundidad la dan el contraste de superficies (suelo, módulo blanco, riel negro) y un borde de 1px. Solo dos cosas tienen sombra, y por su material: el **papel** (una sombra doble y corta que lo despega de la mesa, puesta en un envoltorio porque la perforación recorta al propio papel) y lo que flota sobre todo (diálogos y el globo de un gráfico).

### Shadow Vocabulary
- **Papel** (`filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.14)) drop-shadow(0 6px 12px rgb(0 0 0 / 0.12))`): todo papel de comanda y ticket.
- **Diálogo** (`box-shadow: 0 24px 60px -20px rgb(0 0 0 / 0.5)`): diálogos sobre el velo.
- **Globo** (`box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.4)`): el detalle de una columna en Reportes.

### Named Rules
**La regla del borde o la sombra.** Un módulo lleva borde; el papel lleva sombra; nada lleva las dos.

## Shapes

La carta es recta (0px): bandas, botones, papel. La caja usa esquinas chicas de señalética: placas de 4px, controles de 6px, módulos de 8px. El papel tiene el borde superior e inferior perforado (máscara de dientes) y es la única forma "orgánica" del sistema. Las mesas libres llevan borde punteado; las demás, borde lleno.

## Components

### Buttons
- **Shape:** recto en la carta; 6px en la caja, alto mínimo 40px (32px el chico), 44px en la carta.
- **Primario neutro:** tinta con texto blanco ("Aceptar e imprimir", "Guardar", "Confirmar cierre").
- **De línea:** el color de la sección con su texto (blanco, o tinta sobre ocre), para la acción que avanza el trabajo de esa pantalla.
- **Secundario:** blanco con borde fuerte de 1.5px; al pasar, el borde pasa a tinta; al apretar, baja 1px.
- **Peligro:** texto rojo con borde rojo atenuado ("Anular", "Borrar", "Rechazar").
- **Íconos:** SVG de `@gula/ui` (más, menos, cerrar, tilde, flechas) con trazo cuadrado de 2.25px; nunca caracteres de texto.

### Chips
- **Filtros de Mesas:** botones de 36px con `aria-pressed`; elegido es tinta con texto blanco.
- **Etiquetas de estado:** mayúscula condensada en placa (Cobrado verde, A cobrar ámbar, No se imprimió rojo).

### Cards / Containers
- **Módulo:** superficie blanca, borde de 1px, 8px de esquina, 16px de relleno, título en mayúscula condensada. Sin sombra.
- **Tablas planas dentro de módulos:** cabecera con raya de tinta de 2px, filas con pelo, total con raya de tinta arriba; columnas de texto a la izquierda y cifras a la derecha sin cortes.

### Inputs / Fields
- **Style:** borde fuerte de 1.5px, 6px de esquina, alto 40px; los montos en cifras.
- **Focus:** borde y contorno de 2px en tinta.
- **Interruptor:** pista de 40×24px que se pone verde al prenderse, siempre con el estado escrito al lado ("Hay" / "Sin stock").

### Navigation
- **Riel de la caja:** logo y nombre del local arriba, una muestra de color de 28×22px por sección y el nombre en mayúscula condensada; la activa es blanca con `aria-current="page"`; al pie, "GulaWeb · v{versión}".
- **Cartel:** placa con la cifra de la sección (cantidad de mesas, deliveries en curso, ABIERTA/CERRADA, inicial), título, resumen en una línea y, a la derecha, alerta "N sin atender", conexión, impresora, sync, actualización y usuario con su rol.
- **Pestañas de la carta:** mayúscula comprimida; la activa en tinta con raya de 3px debajo.

### Papel de comanda (componente firma)
Encabezado (local, mesa, hora), líneas de cantidad × nombre en itálica + importe, detalle de opciones y nota, total con raya y pie de acciones. Variantes: armando (carta), entrante con −/+ debajo del importe (caja), talón con sello (CONFIRMADO, ANULADO…) y ticket de vista previa al ancho real del papel. En Entrando, un pedido de 9 renglones o más llega plegado con "Ver los N renglones". El envío de la carta corta el papel por la perforación solo cuando la API acepta el pedido.

### Mesa
Placa + estado en mayúscula + detalle (personas · minutos). Libre: borde punteado sin placa. Abierta: placa verde con número crema. Pedido nuevo y llamó a la moza: placa y borde rojos. Pidió la cuenta: placa ámbar.

### Gráficos de Reportes
Un solo tono (dato-reportes). Columnas por hora de hasta 24px con esquina de 4px arriba, el pico rotulado y un globo en hover y foco, con su tabla en "Ver como tabla". Rankings como tablas con barra integrada de 8px bajo cada nombre: la tabla es el gráfico y su vista accesible.

## Do's and Don'ts

### Do:
- **Do** usar el papel de `@gula/ui` para todo pedido, en la carta y en la caja.
- **Do** escribir cada estado en texto, además de su color.
- **Do** pintar con el color de la línea solo el cartel, la muestra activa del riel y la acción que avanza el trabajo.
- **Do** dejar la plata en cifras tabulares, alineada a la derecha y sin truncar.
- **Do** probar todo con nombres de 80 caracteres, notas de 140, 30 renglones y $ 9.999.999.

### Don't:
- **Don't** usar rojo o ámbar como color de sección o decoración.
- **Don't** poner caracteres de texto como íconos ("+", "−", flechas); usar los SVG de `@gula/ui`.
- **Don't** agregar grises de relleno, crema o terracota a la carta.
- **Don't** poner a la vez borde y sombra blanda a un mismo contenedor.
- **Don't** usar rótulos chiquitos encima de un título; el título se sostiene solo.
