import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Config } from './config.js';
import { crearDb, type Dbs } from './db/cliente.js';
import { registrarErrores } from './errores.js';
import { rutasAuth } from './auth/rutas.js';
import { pluginAuth } from './auth/plugin.js';
import { pluginTiempoReal } from './tiempoReal/socket.js';
import { pluginPermisos } from './permisos/requierePermiso.js';
import { rutasUsuarios } from './usuarios/rutas.js';
import { rutasSectores } from './carta/sectores.rutas.js';
import { rutasCategorias } from './carta/categorias.rutas.js';
import { rutasProductos } from './carta/productos.rutas.js';
import { rutasOpciones } from './carta/opciones.rutas.js';
import { rutasPublicas } from './carta/publica.js';
import { rutasFotos } from './carta/fotos.js';
import { rutasSync } from './sync/rutas.js';
import { rutasMesas } from './salon/mesas.rutas.js';
import { rutasPublicasSalon } from './salon/publico.js';

/** `deps.dbs` permite inyectar conexiones (tests); si no, la app crea y cierra las suyas. */
export async function buildApp(config: Config, deps: { dbs?: Dbs } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : { level: config.nodeEnv === 'production' ? 'info' : 'debug' },
    trustProxy: true,
  });
  const dbs = deps.dbs ?? crearDb(config);
  if (!deps.dbs) app.addHook('onClose', () => dbs.cerrar());

  registrarErrores(app);
  await app.register(rateLimit, { global: false });

  app.get('/salud', async () => ({ ok: true }));
  await app.register(pluginAuth, { dbs, jwtSecret: config.jwtSecret });
  await app.register(pluginPermisos, { dbs });
  await app.register(pluginTiempoReal, { dbs, jwtSecret: config.jwtSecret });
  await app.register(rutasAuth, { config, dbs });
  await app.register(rutasUsuarios, { dbs });
  await app.register(rutasSectores, { dbs });
  await app.register(rutasCategorias, { dbs });
  await app.register(rutasProductos, { dbs });
  await app.register(rutasOpciones, { dbs });
  await app.register(rutasPublicas, { dbs });
  await app.register(rutasFotos, { dbs, dirFotos: config.dirFotos });
  await app.register(rutasSync, { dbs });
  await app.register(rutasMesas, { dbs });
  await app.register(rutasPublicasSalon, { dbs, config });
  return app;
}
