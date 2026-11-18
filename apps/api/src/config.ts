import { z } from 'zod';

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  databaseAdminUrl: string;
  jwtSecret: string;
  rateLimitAuth: number;
  /** Pedidos públicos por minuto e IP (varias mesas pueden compartir el wifi del local). */
  rateLimitPedidosIp: number;
  dirFotos: string;
};

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DATABASE_ADMIN_URL: z.string().min(1, 'DATABASE_ADMIN_URL es obligatoria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_PEDIDOS_IP: z.coerce.number().int().positive().default(30),
  DIR_FOTOS: z.string().min(1).default('./data/fotos'),
});

export function cargarConfig(env: NodeJS.ProcessEnv): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida — ${detalle}`);
  }
  const e = r.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    databaseAdminUrl: e.DATABASE_ADMIN_URL,
    jwtSecret: e.JWT_SECRET,
    rateLimitAuth: e.RATE_LIMIT_AUTH,
    rateLimitPedidosIp: e.RATE_LIMIT_PEDIDOS_IP,
    dirFotos: e.DIR_FOTOS,
  };
}
