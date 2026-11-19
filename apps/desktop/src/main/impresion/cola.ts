import { CONFIG_IMPRESION_POR_DEFECTO, type ConfigImpresion, type Documento } from '../../compartido/impresion';
import type { BaseLocal } from '../db/base';
import { escribirKv, leerKv } from '../db/kv';
import {
  insertarImpresiones,
  leerTrabajos,
  marcarImpresion,
  marcarInterrumpidas,
  reencolarImpresion,
  siguientePendiente,
  type NuevaImpresion,
} from '../db/impresiones';
import { aEscPos } from './escpos';
import type { Transporte } from './windows';

const CLAVE = 'impresion:config';

function leerDocumento(crudo: string): Documento {
  try {
    return JSON.parse(crudo) as Documento;
  } catch {
    throw new Error('El ticket guardado está dañado y no se puede imprimir.');
  }
}
export const INTERRUMPIDA = 'La app se cerró mientras imprimía: no sabemos si salió.';

type Deps = {
  base: BaseLocal;
  transporte: Transporte;
  alVistaPrevia: (documento: Documento, columnas: number) => void;
  alCambiar: () => void;
  ahora?: () => Date;
};

/** Cola persistida con un único trabajador: los tickets salen en orden y nunca se entrelazan. */
export function crearColaImpresion(d: Deps) {
  const ahora = d.ahora ?? (() => new Date());
  let trabajando: Promise<void> | null = null;
  let otraVuelta = false;

  const config = (): ConfigImpresion => {
    const crudo = leerKv(d.base, CLAVE);
    if (!crudo) return { ...CONFIG_IMPRESION_POR_DEFECTO };
    try {
      return { ...CONFIG_IMPRESION_POR_DEFECTO, ...(JSON.parse(crudo) as Partial<ConfigImpresion>) };
    } catch {
      return { ...CONFIG_IMPRESION_POR_DEFECTO };
    }
  };

  async function enviar(documento: Documento) {
    const c = config();
    if (c.modo === 'vista_previa') {
      d.alVistaPrevia(documento, c.columnas);
      return;
    }
    if (!c.impresora) throw new Error('No hay impresora elegida. Elegila en Impresión.');
    await d.transporte.imprimir(c.impresora, aEscPos(documento, c.columnas));
  }

  function procesar(): Promise<void> {
    // Un encolado mientras el trabajador termina (ya vio la cola vacía) lo hace dar otra vuelta.
    if (trabajando) {
      otraVuelta = true;
      return trabajando;
    }
    trabajando = (async () => {
      try {
        for (let t = siguientePendiente(d.base); t; t = siguientePendiente(d.base)) {
          marcarImpresion(d.base, t.id, 'imprimiendo');
          try {
            await enviar(leerDocumento(t.documento));
            marcarImpresion(d.base, t.id, 'impresa', { impresaEn: ahora().toISOString() });
          } catch (e) {
            marcarImpresion(d.base, t.id, 'error', { error: e instanceof Error ? e.message : String(e) });
          }
          d.alCambiar();
        }
      } catch (e) {
        // La base dejó de responder (por ejemplo, al cerrar la app): lo que quedó se resuelve al volver a abrir.
        console.error('La cola de impresión se detuvo', e);
      }
    })().finally(() => {
      trabajando = null;
      if (otraVuelta) {
        otraVuelta = false;
        void procesar();
      }
    });
    return trabajando;
  }

  return {
    encolar(lista: NuevaImpresion[]) {
      if (!lista.length) return;
      insertarImpresiones(d.base, lista, ahora());
      d.alCambiar();
      void procesar();
    },
    reintentar(id: string) {
      if (reencolarImpresion(d.base, id)) {
        d.alCambiar();
        void procesar();
      }
    },
    descartar(id: string) {
      marcarImpresion(d.base, id, 'descartada');
      d.alCambiar();
    },
    /** Al iniciar la app: lo interrumpido pasa a error (decide la moza), lo pendiente se imprime. */
    recuperar() {
      if (marcarInterrumpidas(d.base, INTERRUMPIDA)) d.alCambiar();
      void procesar();
    },
    config,
    fijarConfig(c: ConfigImpresion) {
      escribirKv(d.base, CLAVE, JSON.stringify(c));
    },
    trabajos: () => leerTrabajos(d.base),
    /** Espera a que la cola se vacíe (tests y cierre ordenado). */
    async esperar() {
      while (trabajando) await trabajando;
    },
  };
}

export type ColaImpresion = ReturnType<typeof crearColaImpresion>;
