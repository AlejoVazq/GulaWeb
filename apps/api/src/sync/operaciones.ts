import { eq } from 'drizzle-orm';
import { z, type ZodType } from 'zod';
import { puede, type Accion } from '@gula/shared';
import type { Dbs, Tx } from '../db/cliente.js';
import { conLocal } from '../db/conLocal.js';
import { operacionesAplicadas } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import type { Sesion } from '../auth/plugin.js';
import { verificarPin } from '../auth/pin.js';
import type { Tema } from '../tiempoReal/socket.js';

export type Contexto = { sesion: Sesion; autorizadoPor?: string };

type TipoOperacion<D> = {
  permiso: Accion;
  esquema: ZodType<D>;
  aplicar: (tx: Tx, ctx: Contexto, datos: D) => Promise<void>;
  /** Tema a avisar por tiempo real si se aplicó. */
  tema?: Tema;
};

const tipos = new Map<string, TipoOperacion<unknown>>();

/** Registro extensible: cada fase agrega sus tipos de operación offline. */
export function registrarTipoOperacion<D>(tipo: string, def: TipoOperacion<D>): void {
  tipos.set(tipo, def as TipoOperacion<unknown>);
}

export const esquemaLote = z.object({
  operaciones: z
    .array(
      z.object({
        id: z.uuid(),
        tipo: z.string().min(1).max(60),
        datos: z.unknown(),
        creadaEn: z.iso.datetime({ offset: true }),
        autorizacion: z.object({ usuarioId: z.uuid(), pin: z.string().max(10) }).optional(),
      }),
    )
    .max(100),
});
type Operacion = z.infer<typeof esquemaLote>['operaciones'][number];

export type Resultado =
  | { id: string; estado: 'aplicada' }
  | { id: string; estado: 'rechazada'; error: { codigo: string; mensaje: string } };

const rechazo = (id: string, codigo: string, mensaje: string): Resultado => ({
  id,
  estado: 'rechazada',
  error: { codigo, mensaje },
});

async function guardado(dbs: Dbs, localId: string, id: string): Promise<Resultado | null> {
  const [f] = await conLocal(dbs.dbApp, localId, (tx) =>
    tx.select().from(operacionesAplicadas).where(eq(operacionesAplicadas.id, id)),
  );
  return f ? (f.resultado as Resultado) : null;
}

async function guardar(tx: Tx, sesion: Sesion, op: Operacion, r: Resultado) {
  await tx.insert(operacionesAplicadas).values({
    id: op.id,
    localId: sesion.localId,
    dispositivoId: sesion.dispositivoId,
    tipo: op.tipo,
    resultado: r,
  });
}

async function verificar(dbs: Dbs, sesion: Sesion, op: Operacion) {
  const def = tipos.get(op.tipo);
  if (!def) throw new ErrorApi(400, 'DATOS_INVALIDOS', `Tipo de operación desconocido: ${op.tipo}`);
  const permiso = puede(sesion.rol, def.permiso);
  let autorizadoPor: string | undefined;
  if (permiso === 'no') throw new ErrorApi(403, 'SIN_PERMISO', 'No tenés permiso para hacer esto.');
  if (permiso === 'con_autorizacion') {
    const a = op.autorizacion;
    const sinAutorizacion = new ErrorApi(
      403,
      'REQUIERE_AUTORIZACION',
      'Esta acción necesita el PIN de un encargado.',
    );
    if (!a) throw sinAutorizacion;
    const autorizante = await verificarPin(dbs, sesion.localId, a.usuarioId, a.pin).catch(
      () => null,
    );
    if (!autorizante || puede(autorizante.rol, def.permiso) !== 'si') throw sinAutorizacion;
    autorizadoPor = autorizante.id;
  }
  const datos = def.esquema.safeParse(op.datos);
  if (!datos.success)
    throw new ErrorApi(400, 'DATOS_INVALIDOS', 'Los datos de la operación no son válidos.');
  return { def, datos: datos.data, autorizadoPor };
}

/** Aplica una operación exactamente una vez (idempotente por id). */
async function procesar(
  dbs: Dbs,
  sesion: Sesion,
  op: Operacion,
  temas: Set<Tema>,
): Promise<Resultado> {
  const previo = await guardado(dbs, sesion.localId, op.id);
  if (previo) return previo;

  let resultado: Resultado;
  try {
    const { def, datos, autorizadoPor } = await verificar(dbs, sesion, op);
    resultado = { id: op.id, estado: 'aplicada' };
    await conLocal(dbs.dbApp, sesion.localId, async (tx) => {
      await def.aplicar(tx, { sesion, autorizadoPor }, datos);
      await guardar(tx, sesion, op, resultado);
    });
    if (def.tema) temas.add(def.tema);
    return resultado;
  } catch (e) {
    if (!(e instanceof ErrorApi)) {
      // Choque de id (dos envíos simultáneos de la misma operación): gana el que ya la guardó.
      const ya = await guardado(dbs, sesion.localId, op.id);
      if (ya) return ya;
      throw e;
    }
    resultado = rechazo(op.id, e.codigo, e.message);
  }
  try {
    await conLocal(dbs.dbApp, sesion.localId, (tx) => guardar(tx, sesion, op, resultado));
  } catch {
    const ya = await guardado(dbs, sesion.localId, op.id);
    if (ya) return ya;
  }
  return resultado;
}

export async function procesarLote(dbs: Dbs, sesion: Sesion, ops: Operacion[]) {
  const temas = new Set<Tema>();
  const resultados: Resultado[] = [];
  for (const op of ops) resultados.push(await procesar(dbs, sesion, op, temas));
  return { resultados, temas };
}
