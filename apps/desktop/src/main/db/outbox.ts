import { nuevoId } from '@gula/shared';
import type { Operacion } from '../../compartido/tipos';
import type { BaseLocal } from './base';

type Fila = {
  id: string;
  tipo: string;
  datos: string;
  creada_en: string;
  intentos: number;
  ultimo_error: string | null;
  estado: 'pendiente' | 'rechazada';
  usuario_id: string | null;
};

const aOperacion = (f: Fila): Operacion => ({
  id: f.id,
  tipo: f.tipo,
  datos: JSON.parse(f.datos) as unknown,
  creadaEn: f.creada_en,
  intentos: f.intentos,
  ultimoError: f.ultimo_error,
  estado: f.estado,
  usuarioId: f.usuario_id,
});

export function encolar(base: BaseLocal, op: { tipo: string; datos: unknown; usuarioId?: string }): Operacion {
  const fila: Fila = {
    id: nuevoId(),
    tipo: op.tipo,
    datos: JSON.stringify(op.datos),
    creada_en: new Date().toISOString(),
    intentos: 0,
    ultimo_error: null,
    estado: 'pendiente',
    usuario_id: op.usuarioId ?? null,
  };
  base.db
    .prepare('INSERT INTO outbox (id, tipo, datos, creada_en, usuario_id) VALUES (?, ?, ?, ?, ?)')
    .run(fila.id, fila.tipo, fila.datos, fila.creada_en, fila.usuario_id);
  return aOperacion(fila);
}

/** Pendientes en orden de creación (el id UUIDv7 ordena por tiempo). */
export function pendientes(base: BaseLocal, limite = 100): Operacion[] {
  return (
    base.db.prepare("SELECT * FROM outbox WHERE estado = 'pendiente' ORDER BY id LIMIT ?").all(limite) as Fila[]
  ).map(aOperacion);
}

export function contarPendientes(base: BaseLocal): number {
  return (base.db.prepare("SELECT count(*) AS n FROM outbox WHERE estado = 'pendiente'").get() as { n: number }).n;
}

export function marcarAplicadas(base: BaseLocal, ids: string[]): void {
  const borrar = base.db.prepare('DELETE FROM outbox WHERE id = ?');
  base.transaccion(() => ids.forEach((id) => borrar.run(id)));
}

export function marcarRechazada(base: BaseLocal, id: string, error: string): void {
  base.db.prepare("UPDATE outbox SET estado = 'rechazada', ultimo_error = ? WHERE id = ?").run(error, id);
}

export function registrarFallo(base: BaseLocal, ids: string[], error: string): void {
  const st = base.db.prepare('UPDATE outbox SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?');
  base.transaccion(() => ids.forEach((id) => st.run(error, id)));
}

export function contarRechazadas(base: BaseLocal): number {
  return (base.db.prepare("SELECT count(*) AS n FROM outbox WHERE estado = 'rechazada'").get() as { n: number }).n;
}

/** Vacía la outbox (al vincular la PC a otro local). */
export function vaciarOutbox(base: BaseLocal): void {
  base.db.exec('DELETE FROM outbox');
}
