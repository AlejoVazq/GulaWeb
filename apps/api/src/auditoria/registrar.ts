import { nuevoId } from '@gula/shared';
import type { Tx } from '../db/cliente.js';
import { auditoria } from '../db/schema/index.js';
import type { Sesion } from '../auth/plugin.js';

export type DatosAuditoria = {
  sesion: Sesion;
  accion: string;
  entidad: string;
  entidadId?: string;
  antes?: unknown;
  despues?: unknown;
  autorizadoPor?: string;
};

export async function registrarAuditoria(tx: Tx, d: DatosAuditoria): Promise<void> {
  await tx.insert(auditoria).values({
    id: nuevoId(),
    localId: d.sesion.localId,
    usuarioId: d.sesion.usuarioId,
    autorizadoPor: d.autorizadoPor ?? null,
    accion: d.accion,
    entidad: d.entidad,
    entidadId: d.entidadId ?? null,
    antes: d.antes ?? null,
    despues: d.despues ?? null,
  });
}
