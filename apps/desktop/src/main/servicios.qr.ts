import QRCode from 'qrcode';
import type { Accion } from '@gula/shared';
import type { ServiciosGula } from '../compartido/ipc';
import { hojaQrAHtml, urlCartaMesa, type MesaQr } from '../compartido/qr';
import type { BaseLocal } from './db/base';
import { leerSalon } from './db/salon';
import { ErrorGula } from './errores';

type Deps = {
  base: BaseLocal;
  exigir: (accion: Accion) => string;
  servidor: () => string;
  local: () => { nombre: string; slug: string } | null;
  guardarArchivo: (nombreSugerido: string, datos: Uint8Array | string) => Promise<boolean>;
  htmlAPdf: (html: string) => Promise<Uint8Array>;
};

export function crearServiciosQr(d: Deps): Pick<ServiciosGula, 'mesas:hojaQr'> {
  return {
    'mesas:hojaQr': async () => {
      d.exigir('impresion.configurar');
      const local = d.local();
      if (!local) throw new ErrorGula('SIN_SESION', 'Iniciá sesión primero.');
      const mesas: MesaQr[] = leerSalon(d.base).mesas.map((m) => ({
        nombre: m.nombre,
        zona: m.zona,
        url: urlCartaMesa(d.servidor(), local.slug, m.token),
      }));
      if (!mesas.length) throw new ErrorGula('DATOS_INVALIDOS', 'El local no tiene mesas cargadas.');
      // Corrección de errores alta: el QR sigue leyéndose con manchas o plastificado.
      const svgs = await Promise.all(
        mesas.map((m) => QRCode.toString(m.url, { type: 'svg', errorCorrectionLevel: 'H', margin: 1 })),
      );
      const pdf = await d.htmlAPdf(hojaQrAHtml(local.nombre, mesas, svgs));
      return d.guardarArchivo(`qr-mesas-${local.slug}.pdf`, pdf);
    },
  };
}
