/** Mientras llega la carta: la forma de la banda, las secciones y los renglones, quieta. */
export function EsqueletoCarta() {
  return (
    <div className="carta esqueleto" aria-busy="true">
      <p className="sr-solo">Cargando la carta…</p>
      <div className="cabecera esqueleto__cabecera" aria-hidden="true">
        <span className="esqueleto__bloque esqueleto__bloque--nombre" />
      </div>
      {[4, 3].map((filas, s) => (
        <div key={s} aria-hidden="true">
          <div className="esqueleto__banda" />
          {Array.from({ length: filas }, (_, i) => (
            <div key={i} className="esqueleto__fila">
              <span className="esqueleto__bloque" style={{ width: `${48 + ((i * 17) % 30)}%` }} />
              <span className="esqueleto__bloque esqueleto__bloque--corto" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
