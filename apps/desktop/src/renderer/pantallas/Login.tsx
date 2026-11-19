import { useState, type FormEvent } from 'react';
import { llamar, mensajeDe } from '../gula';

export function Login({ servidor: servidorInicial }: { servidor: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombrePc, setNombrePc] = useState('PC caja');
  const [servidor, setServidor] = useState(servidorInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await llamar('sesion:login', { email, password, nombrePc, servidor });
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="centrado">
      <div>
        <p className="marca-gulaweb" aria-hidden="true">
          GulaWeb
        </p>
        <form className="tarjeta formulario" onSubmit={enviar}>
          <h1>Vincular esta PC</h1>
          <p className="suave">
            Ingresá con el usuario del dueño o del encargado para vincular esta PC al local.
          </p>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Nombre de esta PC
            <input
              value={nombrePc}
              onChange={(e) => setNombrePc(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <details>
            <summary>Opciones avanzadas</summary>
            <label>
              Servidor
              <input type="url" value={servidor} onChange={(e) => setServidor(e.target.value)} />
            </label>
          </details>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" className="boton boton--principal" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </main>
  );
}
