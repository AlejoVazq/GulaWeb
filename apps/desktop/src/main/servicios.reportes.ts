import { TIPOS_PERIODO, rangoValido, type Accion } from '@gula/shared';
import type { ServiciosGula } from '../compartido/ipc';
import { reporteACsv, reporteAHtml, type RespuestaReporte } from '../compartido/reportes';
import { SinConexion } from './api/cliente';
import { ErrorGula, sinConexion } from './errores';

type Canal = Extract<keyof ServiciosGula, `reportes:${string}`>;
export type ServiciosReportes = Pick<ServiciosGula, Canal>;

type Deps = {
  exigir: (accion: Accion) => string;
  pedir: <T>(metodo: 'GET', ruta: string) => Promise<T>;
  /** Nombre del local (encabezado de lo exportado). */
  local: () => string;
  /** Pregunta dónde guardar; false si el usuario canceló. */
  guardarArchivo: (nombreSugerido: string, datos: Uint8Array | string) => Promise<boolean>;
  htmlAPdf: (html: string) => Promise<Uint8Array>;
};

/** Los reportes se calculan en el servidor (la PC solo guarda la operación del día). */
export function crearServiciosReportes(d: Deps): ServiciosReportes {
  return {
    'reportes:obtener': async ({ tipo, desde, hasta }) => {
      d.exigir('reportes.ver');
      if (!TIPOS_PERIODO.includes(tipo)) throw new ErrorGula('DATOS_INVALIDOS', 'Elegí el período.');
      const error = rangoValido({ desde, hasta });
      if (error) throw new ErrorGula('DATOS_INVALIDOS', error);
      try {
        return await d.pedir<RespuestaReporte>('GET', `/reportes?tipo=${tipo}&desde=${desde}&hasta=${hasta}`);
      } catch (e) {
        if (e instanceof SinConexion) throw sinConexion('Los reportes necesitan conexión.');
        throw e;
      }
    },

    'reportes:exportar': async ({ formato, reporte }) => {
      d.exigir('reportes.ver');
      const nombre = `reporte-${reporte.rango.desde}-a-${reporte.rango.hasta}.${formato}`;
      if (formato === 'csv') return d.guardarArchivo(nombre, reporteACsv(reporte, d.local()));
      if (formato === 'pdf') return d.guardarArchivo(nombre, await d.htmlAPdf(reporteAHtml(reporte, d.local())));
      throw new ErrorGula('DATOS_INVALIDOS', 'Formato de exportación desconocido.');
    },
  };
}
