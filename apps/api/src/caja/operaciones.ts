import { eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { CATEGORIAS_MOVIMIENTO, resumenTurno } from '@gula/shared';
import { movimientosCaja, pagos, turnosCaja } from '../db/schema/index.js';
import { ErrorApi } from '../errores.js';
import { registrarAuditoria } from '../auditoria/registrar.js';
import { registrarTipoOperacion } from '../sync/operaciones.js';
import { monto, montoOCero, motivo, turnoAbierto } from './comun.js';
import './cobro.js';
import './anulaciones.js';

registrarTipoOperacion('caja.abrir', {
  permiso: 'caja.operar',
  tema: 'caja',
  esquema: z.object({ turnoId: z.uuid(), fondo: montoOCero }),
  aplicar: async (tx, { sesion, hechaEn }, d) => {
    const [abierta] = await tx.select({ id: turnosCaja.id }).from(turnosCaja).where(isNull(turnosCaja.cerradoEn));
    if (abierta) throw new ErrorApi(409, 'CAJA_ABIERTA', 'Ya hay una caja abierta.');
    await tx.insert(turnosCaja).values({
      id: d.turnoId,
      localId: sesion.localId,
      abiertoPor: sesion.usuarioId,
      abiertoEn: hechaEn,
      fondo: d.fondo,
    });
    await registrarAuditoria(tx, { sesion, accion: 'caja.abrir', entidad: 'turno_caja', entidadId: d.turnoId, despues: { fondo: d.fondo } });
  },
});

registrarTipoOperacion('caja.movimiento', {
  permiso: 'caja.operar',
  tema: 'caja',
  esquema: z.object({
    movimientoId: z.uuid(),
    turnoId: z.uuid(),
    tipo: z.enum(['ingreso', 'egreso']),
    categoria: z.enum(CATEGORIAS_MOVIMIENTO),
    monto,
    motivo,
  }),
  aplicar: async (tx, { sesion, hechaEn, autorizadoPor }, d) => {
    await turnoAbierto(tx, d.turnoId);
    await tx.insert(movimientosCaja).values({
      id: d.movimientoId,
      localId: sesion.localId,
      turnoId: d.turnoId,
      tipo: d.tipo,
      categoria: d.categoria,
      monto: d.monto,
      motivo: d.motivo,
      usuarioId: sesion.usuarioId,
      hechoEn: hechaEn,
    });
    await registrarAuditoria(tx, {
      sesion,
      autorizadoPor,
      accion: `caja.${d.tipo}`,
      entidad: 'movimiento_caja',
      entidadId: d.movimientoId,
      despues: { categoria: d.categoria, monto: d.monto, motivo: d.motivo },
    });
  },
});

registrarTipoOperacion('caja.cerrar', {
  permiso: 'caja.operar',
  tema: 'caja',
  esquema: z.object({ turnoId: z.uuid(), contado: montoOCero, notas: z.string().max(280).nullish() }),
  aplicar: async (tx, { sesion, hechaEn }, d) => {
    const t = await turnoAbierto(tx, d.turnoId);
    const ps = await tx.select().from(pagos).where(eq(pagos.turnoId, t.id));
    const ms = await tx.select().from(movimientosCaja).where(eq(movimientosCaja.turnoId, t.id));
    const r = resumenTurno({ fondo: t.fondo, pagos: ps, movimientos: ms });
    const diferencia = d.contado - r.efectivoEsperado;
    await tx
      .update(turnosCaja)
      .set({
        cerradoPor: sesion.usuarioId,
        cerradoEn: hechaEn,
        contado: d.contado,
        esperado: r.efectivoEsperado,
        diferencia,
        notas: d.notas?.trim() || null,
      })
      .where(eq(turnosCaja.id, t.id));
    await registrarAuditoria(tx, {
      sesion,
      accion: 'caja.cerrar',
      entidad: 'turno_caja',
      entidadId: t.id,
      despues: { esperado: r.efectivoEsperado, contado: d.contado, diferencia, ventas: r.ventas, propinas: r.propinas },
    });
  },
});
