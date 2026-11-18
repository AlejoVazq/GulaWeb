import type { EstadoSync } from '../../compartido/ipc';

export function Conexion({ estado }: { estado: EstadoSync }) {
  const n = estado.pendientes;
  const texto =
    estado.conexion === 'en-linea'
      ? 'En línea'
      : estado.conexion === 'sincronizando'
        ? 'Sincronizando…'
        : `Sin conexión — ${n} ${n === 1 ? 'cambio pendiente' : 'cambios pendientes'}`;
  return (
    <span role="status" className={`conexion conexion--${estado.conexion}`}>
      <span className="conexion__punto" aria-hidden="true" />
      {texto}
    </span>
  );
}
