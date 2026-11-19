/** Hoja A4 con un QR por mesa, lista para imprimir, recortar y pegar (o grabar en el NFC). */

export type MesaQr = { nombre: string; zona: string | null; url: string };

const escapar = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Dirección pública de la carta de una mesa. `servidor` es la URL del API que usa la PC;
 * en producción el API vive en `https://dominio/api` y la carta en `https://dominio/`.
 */
export function urlCartaMesa(servidor: string, slug: string, token: string): string {
  const base = servidor.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${base}/${encodeURIComponent(slug)}/m/${encodeURIComponent(token)}`;
}

/** `svgs[i]` es el QR (SVG) de `mesas[i]`. */
export function hojaQrAHtml(local: string, mesas: MesaQr[], svgs: string[]): string {
  const tarjetas = mesas
    .map(
      (m, i) => `<div class="tarjeta">
  <div class="local">${escapar(local)}</div>
  <div class="qr">${svgs[i] ?? ''}</div>
  <div class="mesa">${escapar(m.nombre)}</div>
  ${m.zona ? `<div class="zona">${escapar(m.zona)}</div>` : ''}
  <div class="texto">Escaneá para ver la carta y pedir</div>
  <div class="url">${escapar(m.url)}</div>
</div>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>QR de mesas · ${escapar(local)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1c1917; }
  .grilla { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .tarjeta { border: 1px dashed #a8a29e; border-radius: 4mm; padding: 6mm; text-align: center; break-inside: avoid; height: 128mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2mm; }
  .local { font-size: 13pt; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .qr svg { width: 62mm; height: 62mm; }
  .mesa { font-size: 26pt; font-weight: 800; }
  .zona { font-size: 11pt; color: #57534e; }
  .texto { font-size: 11pt; }
  .url { font-size: 7pt; color: #78716c; word-break: break-all; }
</style></head>
<body><div class="grilla">
${tarjetas}
</div></body></html>`;
}
