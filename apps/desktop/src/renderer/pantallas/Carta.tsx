import type { EstadoSync, UsuarioPublico } from '../../compartido/ipc';

export function Carta(_: { usuario: UsuarioPublico; conexion: EstadoSync['conexion'] }) {
  return <p className="suave">Cargando carta…</p>;
}
