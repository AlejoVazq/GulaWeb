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
];
