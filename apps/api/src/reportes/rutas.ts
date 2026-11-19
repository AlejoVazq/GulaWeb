import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TIPOS_PERIODO, periodoAnterior, puede, rangoValido } from '@gula/shared';
import type { Dbs } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { datosInvalidos } from '../carta/comun.js';
import { leerReporte } from './consultas.js';

const consulta = z.object({
  desde: z.string(),
  hasta: z.string(),
  tipo: z.enum(TIPOS_PERIODO).default('personalizado'),
});

export async function rutasReportes(app: FastifyInstance, { dbs }: { dbs: Dbs }) {
  const pre = { preHandler: [app.autenticar, app.requierePermiso('reportes.ver')] };
  app.get('/reportes', pre, async (req) => {
    const q = consulta.safeParse(req.query);
    if (!q.success) throw datosInvalidos('Indicá el período.');
    const rango = { desde: q.data.desde, hasta: q.data.hasta };
    const error = rangoValido(rango);
    if (error) throw datosInvalidos(error);
    const rangoAnterior = periodoAnterior(q.data.tipo, rango);
    const conResultado = puede(req.sesion.rol, 'reportes.resultado') === 'si';
    return conLocal(dbs.dbApp, req.sesion.localId, async (tx) => ({
      rango,
      rangoAnterior,
      actual: await leerReporte(tx, rango, conResultado),
      anterior: await leerReporte(tx, rangoAnterior, conResultado),
    }));
  });
}
