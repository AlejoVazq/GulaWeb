/** Migraciones de la base local de la PC. Solo se agregan al final; nunca se editan. */
export const MIGRACIONES: string[] = [
  `
  CREATE TABLE kv (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

  CREATE TABLE sectores (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, orden INTEGER NOT NULL,
    actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE TABLE categorias (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, orden INTEGER NOT NULL, visible INTEGER NOT NULL,
    horario_desde TEXT, horario_hasta TEXT, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE TABLE productos (
    id TEXT PRIMARY KEY, categoria_id TEXT NOT NULL, sector_id TEXT, nombre TEXT NOT NULL,
    descripcion TEXT, precio INTEGER NOT NULL, foto TEXT, disponible INTEGER NOT NULL,
    visible INTEGER NOT NULL, orden INTEGER NOT NULL, etiquetas TEXT NOT NULL,
    actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX productos_categoria ON productos(categoria_id);
  CREATE TABLE grupos (
    id TEXT PRIMARY KEY, producto_id TEXT NOT NULL, nombre TEXT NOT NULL, min INTEGER NOT NULL,
    max INTEGER NOT NULL, orden INTEGER NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX grupos_producto ON grupos(producto_id);
  CREATE TABLE opciones (
    id TEXT PRIMARY KEY, grupo_id TEXT NOT NULL, nombre TEXT NOT NULL, recargo INTEGER NOT NULL,
    disponible INTEGER NOT NULL, orden INTEGER NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX opciones_grupo ON opciones(grupo_id);

  CREATE TABLE outbox (
    id TEXT PRIMARY KEY, tipo TEXT NOT NULL, datos TEXT NOT NULL, creada_en TEXT NOT NULL,
    intentos INTEGER NOT NULL DEFAULT 0, ultimo_error TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'rechazada'))
  );
  `,
  // v2: quién hizo cada operación (se envía al servidor como actor).
  `ALTER TABLE outbox ADD COLUMN usuario_id TEXT;`,
  // v3: el salón (espejo de /sync/salon). Las filas creadas en la PC nacen con actualizado_en = ''
  // para que la versión del servidor siempre las pise.
  `
  CREATE TABLE mesas (
    id TEXT PRIMARY KEY, nombre TEXT NOT NULL, zona TEXT, capacidad INTEGER, orden INTEGER NOT NULL,
    token TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE TABLE sesiones (
    id TEXT PRIMARY KEY, mesa_id TEXT NOT NULL, estado TEXT NOT NULL, comensales INTEGER,
    abierta_por TEXT, abierta_en TEXT NOT NULL, cerrada_por TEXT, cerrada_en TEXT,
    actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX sesiones_mesa ON sesiones(mesa_id);
  CREATE TABLE pedidos (
    id TEXT PRIMARY KEY, origen TEXT NOT NULL, estado TEXT NOT NULL, sesion_id TEXT, mesa_id TEXT,
    numero INTEGER, dia TEXT, notas TEXT, motivo_rechazo TEXT, creado_por TEXT, confirmado_por TEXT,
    confirmado_en TEXT, rechazado_en TEXT, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX pedidos_sesion ON pedidos(sesion_id);
  CREATE INDEX pedidos_estado ON pedidos(estado);
  CREATE TABLE items (
    id TEXT PRIMARY KEY, pedido_id TEXT NOT NULL, producto_id TEXT NOT NULL, nombre TEXT NOT NULL,
    precio_unitario INTEGER NOT NULL, cantidad INTEGER NOT NULL, seleccion TEXT NOT NULL,
    resumen_opciones TEXT NOT NULL, nota TEXT NOT NULL, sector_id TEXT, anulado INTEGER NOT NULL,
    creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX items_pedido ON items(pedido_id);
  CREATE TABLE avisos (
    id TEXT PRIMARY KEY, sesion_id TEXT NOT NULL, tipo TEXT NOT NULL, atendido_por TEXT, atendido_en TEXT,
    creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX avisos_sesion ON avisos(sesion_id);
  `,
  // v4: cola de impresión (solo de esta PC; no se sincroniza).
  `
  CREATE TABLE impresiones (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('comanda', 'cuenta', 'prueba', 'cierre')),
    pedido_id TEXT, sector_id TEXT, titulo TEXT NOT NULL, documento TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'imprimiendo', 'impresa', 'error', 'descartada')),
    error TEXT, intentos INTEGER NOT NULL DEFAULT 0, creada_en TEXT NOT NULL, impresa_en TEXT
  );
  CREATE INDEX impresiones_estado ON impresiones(estado);
  `,
  // v5: la caja (espejo de /sync/caja), anulaciones y la autorización de las operaciones.
  `
  CREATE TABLE turnos (
    id TEXT PRIMARY KEY, abierto_por TEXT NOT NULL, abierto_en TEXT NOT NULL, fondo INTEGER NOT NULL,
    cerrado_por TEXT, cerrado_en TEXT, contado INTEGER, esperado INTEGER, diferencia INTEGER, notas TEXT,
    actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE TABLE cobros (
    id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, sesion_id TEXT, pedido_id TEXT, subtotal INTEGER NOT NULL,
    descuento INTEGER NOT NULL, motivo_descuento TEXT, total INTEGER NOT NULL, cobrado_por TEXT NOT NULL,
    cobrado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX cobros_turno ON cobros(turno_id);
  CREATE TABLE pagos (
    id TEXT PRIMARY KEY, cobro_id TEXT NOT NULL, turno_id TEXT NOT NULL, metodo TEXT NOT NULL, monto INTEGER NOT NULL,
    propina INTEGER NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX pagos_turno ON pagos(turno_id);
  CREATE TABLE movimientos (
    id TEXT PRIMARY KEY, turno_id TEXT NOT NULL, tipo TEXT NOT NULL, categoria TEXT NOT NULL, monto INTEGER NOT NULL,
    motivo TEXT NOT NULL, usuario_id TEXT NOT NULL, hecho_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, eliminado_en TEXT
  );
  CREATE INDEX movimientos_turno ON movimientos(turno_id);
  ALTER TABLE pedidos ADD COLUMN anulado_por TEXT;
  ALTER TABLE pedidos ADD COLUMN motivo_anulacion TEXT;
  ALTER TABLE pedidos ADD COLUMN anulado_en TEXT;
  ALTER TABLE items ADD COLUMN anulado_por TEXT;
  ALTER TABLE items ADD COLUMN motivo_anulacion TEXT;
  ALTER TABLE items ADD COLUMN anulado_en TEXT;
  ALTER TABLE outbox ADD COLUMN autorizacion TEXT;
  `,
];
