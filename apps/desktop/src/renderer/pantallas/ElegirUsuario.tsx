import { useEffect, useState } from 'react';
import type { LocalInfo, UsuarioPublico } from '../../compartido/ipc';
import { llamar, mensajeDe } from '../gula';

const ROL: Record<UsuarioPublico['rol'], string> = {
  dueno: 'Dueño',
  encargado: 'Encargado',
  mesero: 'Mesero/a',
};
const MAX_PIN = 6;

export function ElegirUsuario({ local }: { local: LocalInfo }) {
  const [usuarios, setUsuarios] = useState<UsuarioPublico[] | null>(null);
  const [elegido, setElegido] = useState<UsuarioPublico | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    llamar('sesion:usuarios')
      .then(setUsuarios)
      .catch((e: unknown) => setError(mensajeDe(e)));
  }, []);

  // El listener de teclado se re-registra en cada render, así que siempre ve el PIN actual.
  const entrar = async (valor = pin) => {
    if (!elegido || valor.length < 4 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await llamar('sesion:elegirUsuario', { usuarioId: elegido.id, pin: valor });
    } catch (e) {
      setError(mensajeDe(e));
      setPin('');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    if (!elegido) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < MAX_PIN ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') setElegido(null);
      else if (e.key === 'Enter') void entrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  });

  if (!elegido) {
    return (
      <main className="centrado">
        <div>
          <p className="marca-gulaweb" aria-hidden="true">
            GulaWeb
          </p>
          <div className="tarjeta">
            <h1>{local.nombre}</h1>
            <p className="suave">¿Quién va a usar la PC?</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="grilla-usuarios">
              {usuarios?.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="boton boton--usuario"
                  data-inicial={u.nombre.trim().charAt(0).toUpperCase()}
                  onClick={() => {
                    setElegido(u);
                    setPin('');
                    setError(null);
                  }}
                >
                  <strong>{u.nombre}</strong>
                  <span className="suave">{ROL[u.rol]}</span>
                </button>
              ))}
            </div>
            {usuarios?.length === 0 && (
              <p className="suave">
                No hay usuarios guardados para este local. Ingresá de nuevo con el email del dueño.
              </p>
            )}
            <button
              type="button"
              className="enlace"
              onClick={() => llamar('sesion:cerrar').catch((e: unknown) => setError(mensajeDe(e)))}
            >
              Cambiar de local o de servidor
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="centrado">
      <div className="tarjeta teclado-pin">
        <button type="button" className="enlace" onClick={() => setElegido(null)}>
          ← Volver
        </button>
        <h2>Hola, {elegido.nombre}</h2>
        <p className="suave">Ingresá tu PIN</p>
        <div className="pin" aria-label={`${pin.length} dígitos ingresados`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
            <span
              key={i}
              className={i < pin.length ? 'pin__punto pin__punto--lleno' : 'pin__punto'}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="teclado">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              className="boton tecla"
              onClick={() => setPin((p) => (p.length < MAX_PIN ? p + d : p))}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            className="boton tecla"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Borrar"
          >
            ⌫
          </button>
          <button
            type="button"
            className="boton tecla"
            onClick={() => setPin((p) => (p.length < MAX_PIN ? p + '0' : p))}
          >
            0
          </button>
          <button
            type="button"
            className="boton tecla boton--principal"
            onClick={() => void entrar()}
            disabled={pin.length < 4 || enviando}
          >
            Entrar
          </button>
        </div>
      </div>
    </main>
  );
}
