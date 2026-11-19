import type { Marca } from '@gula/shared';

/** "Mesa 7" → "7"; si el nombre no termina en número se muestra entero. */
function numeroDeMesa(nombre: string): string {
  const m = /(\d+)\s*$/.exec(nombre);
  return m ? m[1]!.padStart(2, '0') : nombre;
}

/** La banda negra del local: logo, nombre, lema y el sello de la mesa. */
export function CabeceraLocal({ nombre, marca, mesa }: { nombre: string; marca: Marca; mesa?: string }) {
  return (
    <header className="cabecera">
      {marca.logo && <img className="carta__logo" src={marca.logo} alt="" width={34} height={34} />}
      <div className="cabecera__marca">
        <h1 className="cabecera__nombre">{nombre}</h1>
        {marca.lema && <p className="cabecera__lema">{marca.lema}</p>}
      </div>
      {mesa && (
        <p className="cabecera__mesa" aria-label={mesa}>
          <span aria-hidden="true" className="cabecera__mesa-rotulo">
            MESA
          </span>
          <span aria-hidden="true" className="cabecera__mesa-numero">
            {numeroDeMesa(mesa)}
          </span>
        </p>
      )}
    </header>
  );
}
