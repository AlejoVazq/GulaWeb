# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(La app de caja es Electron sobre Windows, pero su lenguaje de diseño es web propio, no nativo.)

## Users

- **Cliente del local**: está sentado en la mesa con amigos, escanea el QR/NFC con su celular, muchas veces con mala señal y poca luz. Quiere ver qué hay, cuánto sale, y pedir sin registrarse ni descargar nada.
- **Personal del local** (dueño, encargado, mesero): usa la PC de caja durante el servicio, con apuro y de pie. Abre mesas, recibe pedidos en vivo, imprime comandas, cobra, carga delivery y mira la caja del día.
- **Dueño del local como comprador**: hoy no conoce GulaWeb. Se le va a presentar el producto terminado; tiene que verse como algo hecho para su local, no como una plantilla.

## Product Purpose

Carta digital por mesa (QR + NFC) desde la que el cliente pide, más un POS de escritorio donde el local gestiona pedidos, delivery, caja y reportes, y sigue funcionando sin internet. Éxito inmediato: que al dueño de Gula le guste lo suficiente para adoptarlo. Después: revenderlo a otros locales.

## Positioning

Producto local, vendido y mantenido por una persona: cobro único + abono mínimo, un VPS compartido multi-local, la carta lleva la identidad visual de cada local (no la de GulaWeb), y la caja no se frena si se corta internet.

## Operating Context

- Primer cliente: **Gula**, cervecería / pub. Grupos, pizzas, burgers, cervezas y tragos; ambiente relajado de tarde/noche. 14 mesas.
- El pitch muestra **las dos piezas por igual**: el dueño escanea el QR, ve su carta, pide, y el pedido entra en vivo en la PC.
- PCs de caja Windows con impresora térmica 80 mm.
- En producción en https://vaztech.com.ar.

## Capabilities and Constraints

- Todo lo específico de un local (marca, carta, mesas) es configuración, nunca código.
- Español rioplatense, ARS, America/Argentina/Buenos_Aires.
- Fuera de alcance por ahora: facturación ARCA, cobro online, integraciones con apps de delivery, stock de insumos, app nativa.
- Carta pública: sin login, sin descargas, rápida con mala señal.

## Brand Commitments

- Identidad de Gula (referida por el usuario): blanco y negro, logo de una hoja, nombres de productos en itálica bold, títulos en mayúscula sobre bandas negras, "est. 2024".
- GulaWeb como marca propia aparece en la app de caja; en la carta manda la marca del local.
- Anti-objetivo: interfaz genérica tipo plantilla o con cara de "hecha con IA".

## Evidence on Hand

- Carta real de Gula cargada (precios provisorios): Entrantes, Pizzas, Burgers, Bebidas sin alcohol, Cervezas, Bebidas con alcohol.
- **No hay logo en archivo ni fotos** de productos o del local. El diseño tiene que verse terminado sin fotos. No inventar imágenes de platos ni testimonios.

## Product Principles

1. La carta es del local: su identidad primero, GulaWeb invisible.
2. Pedir tiene que ser más rápido que llamar al mozo.
3. En la caja, la claridad bajo apuro le gana a la decoración.
4. Nada se pierde: estados de pedido y conexión siempre visibles.
5. Se ve terminado aunque falten fotos.

## Accessibility & Inclusion

Legible con poca luz y en celulares chicos; objetivos táctiles grandes; respetar prefers-reduced-motion.
