import { useEffect, useState } from 'react';
import type { EstadoSesion, EstadoSync } from '../compartido/ipc';
import { escuchar, llamar } from './gula';
import { Login } from './pantallas/Login';
import { ElegirUsuario } from './pantallas/ElegirUsuario';
import { Shell } from './pantallas/Shell';

export function App() {
  const [sesion, setSesion] = useState<EstadoSesion | null>(null);
  const [sync, setSync] = useState<EstadoSync>({ conexion: 'sincronizando', pendientes: 0, ultimaSync: null });

  useEffect(() => {
    void llamar('sesion:estado').then(setSesion);
    void llamar('sync:estado').then(setSync);
    const quitar1 = escuchar('sesion:cambio', (d) => setSesion(d as EstadoSesion));
    const quitar2 = escuchar('sync:estado', (d) => setSync(d as EstadoSync));
    // Cualquier interacción cuenta como actividad (para el bloqueo automático), como mucho cada 30 s.
    let ultima = 0;
    const actividad = () => {
      if (Date.now() - ultima < 30_000) return;
      ultima = Date.now();
      void llamar('sesion:actividad');
    };
    window.addEventListener('pointerdown', actividad);
    window.addEventListener('keydown', actividad);
    return () => {
      quitar1();
      quitar2();
      window.removeEventListener('pointerdown', actividad);
      window.removeEventListener('keydown', actividad);
    };
  }, []);

  if (!sesion) return <p className="centrado suave">Cargando…</p>;
  if (sesion.tipo === 'sin-dispositivo') return <Login servidor={sesion.servidor} />;
  if (sesion.tipo === 'bloqueada') return <ElegirUsuario local={sesion.local} />;
  return <Shell sesion={sesion} sync={sync} />;
}
