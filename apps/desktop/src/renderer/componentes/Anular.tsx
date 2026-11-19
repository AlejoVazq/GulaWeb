import { useEffect, useState } from 'react';
import type { Autorizacion, UsuarioPublico } from '../../compartido/ipc';
import { llamar, mensajeDe } from '../gula';
import { Dialogo } from './Dialogo';

/** Anulación con motivo; una moza necesita elegir un encargado y poner su PIN. */
export function Anular({
  titulo,
  necesitaPin,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  necesitaPin: boolean;
  onConfirmar: (motivo: string, autorizacion?: Autorizacion) => Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [autorizantes, setAutorizantes] = useState<UsuarioPublico[]>([]);
  const [quien, setQuien] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!necesitaPin) return;
    void llamar('sesion:autorizantes')
      .then(setAutorizantes)
      .catch(() => undefined);
  }, [necesitaPin]);

  const listo = motivo.trim() && (!necesitaPin || (quien && pin)) && !enviando;
  return (
    <Dialogo titulo={titulo} onCerrar={onCancelar}>
      <label className="campo">
        Motivo
        <input value={motivo} maxLength={140} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {necesitaPin && (
        <>
          <p className="suave">Necesita la autorización de un encargado.</p>
          <label className="campo">
            Autoriza
            <select value={quien} onChange={(e) => setQuien(e.target.value)}>
              <option value="">Elegí…</option>
              {autorizantes.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            PIN
            <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fila">
        <button
          type="button"
          className="boton boton--peligro"
          disabled={!listo}
          onClick={() => {
            setEnviando(true);
            setError(null);
            void onConfirmar(motivo.trim(), necesitaPin ? { usuarioId: quien, pin } : undefined)
              .catch((e: unknown) => setError(mensajeDe(e)))
              .finally(() => setEnviando(false));
          }}
        >
          Anular
        </button>
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  );
}
