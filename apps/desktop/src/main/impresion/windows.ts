import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Transporte = { imprimir(impresora: string, datos: Uint8Array): Promise<void> };
export type Ejecutar = (o: { script: string; env: Record<string, string> }) => Promise<{ codigo: number; salida: string; stderr: string }>;

const TIMEOUT_MS = 20_000;

/**
 * Envía bytes RAW al spooler (OpenPrinter → StartDocPrinter "RAW" → WritePrinter). El nombre de la
 * impresora y el archivo llegan por variables de entorno: nunca se interpolan en el script.
 */
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$codigo = @'
using System;
using System.Runtime.InteropServices;
public static class GulaRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr h, int nivel, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr h, byte[] datos, int n, out int escritos);
  public static string Enviar(string impresora, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(impresora, out h, IntPtr.Zero)) return "NO_ENCONTRADA";
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "GulaWeb";
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "NO_ACEPTO";
      try {
        StartPagePrinter(h);
        int escritos;
        bool ok = WritePrinter(h, datos, datos.Length, out escritos);
        EndPagePrinter(h);
        if (!ok || escritos != datos.Length) return "INCOMPLETO";
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "OK";
  }
}
'@
Add-Type -TypeDefinition $codigo
$r = [GulaRaw]::Enviar($env:GULA_IMPRESORA, [IO.File]::ReadAllBytes($env:GULA_ARCHIVO))
if ($r -ne 'OK') { [Console]::Out.WriteLine('GULA:' + $r); exit 1 }
exit 0
`;

const powershell: Ejecutar = ({ script, env }) =>
  new Promise((resolve, reject) => {
    // -EncodedCommand (UTF-16LE en base64): el script entero se parsea de una vez, sin depender de stdin.
    const codificado = Buffer.from(script, 'utf16le').toString('base64');
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', codificado];
    const p = spawn('powershell.exe', args, {
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    let stderr = '';
    let salida = '';
    const reloj = setTimeout(() => {
      p.kill();
      reject(new Error('La impresora no respondió a tiempo.'));
    }, TIMEOUT_MS);
    p.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    p.stdout.on('data', (d: Buffer) => (salida += d.toString()));
    p.on('error', (e) => {
      clearTimeout(reloj);
      reject(new Error(`No se pudo iniciar la impresión: ${e.message}`));
    });
    p.on('close', (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo: codigo ?? 1, salida, stderr });
    });
    p.stdin.end();
  });

/** El script informa su resultado como `GULA:<código>` por stdout; cualquier otra cosa es un error de PowerShell. */
function mensaje(impresora: string, salida: string, stderr: string): string {
  const codigo = /GULA:([A-Z_]+)/.exec(salida)?.[1];
  switch (codigo) {
    case 'NO_ENCONTRADA':
      return `No se encontró la impresora "${impresora}". Revisá que esté instalada en Windows.`;
    case 'NO_ACEPTO':
      return 'La impresora no aceptó el trabajo.';
    case 'INCOMPLETO':
      return 'La impresora no recibió el ticket completo.';
  }
  // PowerShell con salida redirigida escribe los errores como CLIXML: se extrae el texto legible.
  const texto = stderr.includes('CLIXML')
    ? [...stderr.matchAll(/<S S="Error">(.*?)<\/S>/g)].map((m) => m[1]!.replace(/_x000D__x000A_/g, ' ')).join('')
    : stderr;
  const primera = texto.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  return `No se pudo imprimir: ${primera || 'error desconocido'}`;
}

export function crearTransporteWindows(opts: { ejecutar?: Ejecutar; dirTemporal?: string } = {}): Transporte {
  const ejecutar = opts.ejecutar ?? powershell;
  const dir = opts.dirTemporal ?? join(tmpdir(), 'gula-impresion');
  return {
    async imprimir(impresora, datos) {
      mkdirSync(dir, { recursive: true });
      const archivo = join(dir, `${randomUUID()}.bin`);
      writeFileSync(archivo, datos);
      try {
        const r = await ejecutar({ script: SCRIPT, env: { GULA_IMPRESORA: impresora, GULA_ARCHIVO: archivo } });
        if (r.codigo !== 0) throw new Error(mensaje(impresora, r.salida, r.stderr));
      } finally {
        rmSync(archivo, { force: true });
      }
    },
  };
}
