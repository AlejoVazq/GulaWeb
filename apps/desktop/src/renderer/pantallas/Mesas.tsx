import { useState } from 'react';
import type { MesaSalon, Salon } from '../../compartido/salon';
import { llamar, mensajeDe } from '../gula';
import { Dialogo } from '../componentes/Dialogo';

type Props = {
  salon: Salon;
  onVerMesa: (mesaId: string) => void;
  onMostrador: () => void;
  /** Para los minutos abiertos (tests). */
  ahora?: Date;
};

type Estado = { texto: string; tono: 'libre' | 'abierta' | 'pendiente' | 'aviso' | 'cuenta' };

/** Lo más urgente primero; cada estado lleva texto (no solo color). */
function estadoDe(m: MesaSalon): Estado[] {
  if (!m.sesion) return [{ texto: 'Libre', tono: 'libre' }];
  const estados: Estado[] = [];
  if (m.pendientes > 0) estados.push({ texto: 'Pedido pendiente', tono: 'pendiente' });
  if (m.avisos.some((a) => a.tipo === 'llamar')) estados.push({ texto: 'Llamó a la moza', tono: 'aviso' });
  if (m.sesion.estado === 'cuenta_pedida' || m.avisos.some((a) => a.tipo === 'cuenta'))
    estados.push({ texto: 'Pidió la cuenta', tono: 'cuenta' });
  if (!estados.length) estados.push({ texto: 'Abierta', tono: 'abierta' });
  return estados;
}

function detalle(m: MesaSalon, ahora: Date): string | null {
  if (!m.sesion) return m.capacidad ? `${m.capacidad} lugares` : null;
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(m.sesion.abiertaEn).getTime()) / 60_000));
  const personas = m.sesion.comensales ? `${m.sesion.comensales} ${m.sesion.comensales === 1 ? 'persona' : 'personas'} · ` : '';
  return `${personas}${minutos} min`;
}

function AbrirMesa({ mesa, onCerrar, onAbierta }: { mesa: MesaSalon; onCerrar: () => void; onAbierta: () => void }) {
  const [personas, setPersonas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const abrir = async () => {
    const n = personas.trim() ? Number(personas) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 100)) {
      setError('Poné un número de personas entre 1 y 100, o dejalo vacío.');
      return;
    }
    setEnviando(true);
    try {
      await llamar('salon:abrirMesa', { mesaId: mesa.id, comensales: n });
      onAbierta();
    } catch (e) {
      setError(mensajeDe(e));
      setEnviando(false);
    }
  };
  return (
    <Dialogo titulo={`Abrir ${mesa.nombre}`} onCerrar={onCerrar}>
      <form
        className="formulario"
        onSubmit={(e) => {
          e.preventDefault();
          void abrir();
        }}
      >
        <label>
          Personas (opcional)
          <input inputMode="numeric" value={personas} onChange={(e) => setPersonas(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="fila">
          <button type="submit" className="boton boton--principal" disabled={enviando}>
            Abrir mesa
          </button>
          <button type="button" className="boton" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

export function Mesas({ salon, onVerMesa, onMostrador, ahora = new Date() }: Props) {
  const [abriendo, setAbriendo] = useState<MesaSalon | null>(null);
  const zonas = new Map<string, MesaSalon[]>();
  for (const m of salon.mesas) {
    const z = m.zona ?? 'Mesas';
    if (!zonas.has(z)) zonas.set(z, []);
    zonas.get(z)!.push(m);
  }

  return (
    <div className="mesas">
      <div className="fila fila--entre">
        <h1 className="titulo">Mesas</h1>
        <button type="button" className="boton boton--principal" onClick={onMostrador}>
          Pedido de mostrador
        </button>
      </div>
      {!salon.mesas.length && (
        <p className="suave">Todavía no hay mesas. El dueño las carga desde Configuración (o con la carga de demo).</p>
      )}
      {[...zonas].map(([zona, mesas]) => (
        <section key={zona} className="zona" aria-labelledby={`zona-${zona}`}>
          <h2 id={`zona-${zona}`} className="zona__titulo">
            {zona}
          </h2>
          <div className="grilla-mesas">
            {mesas.map((m) => {
              const estados = estadoDe(m);
              const info = detalle(m, ahora);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`mesa mesa--${estados[0]!.tono}`}
                  onClick={() => (m.sesion ? onVerMesa(m.id) : setAbriendo(m))}
                >
                  <span className="mesa__nombre">{m.nombre}</span>
                  {estados.map((e) => (
                    <span key={e.texto} className={`etiqueta etiqueta--${e.tono}`}>
                      {e.texto}
                    </span>
                  ))}
                  {info && <span className="mesa__detalle">{info}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {abriendo && (
        <AbrirMesa
          mesa={abriendo}
          onCerrar={() => setAbriendo(null)}
          onAbierta={() => {
            const id = abriendo.id;
            setAbriendo(null);
            onVerMesa(id);
          }}
        />
      )}
    </div>
  );
}
