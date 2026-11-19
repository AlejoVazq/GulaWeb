import { useState } from 'react';
import type { EstadoSesion, EstadoSync } from '../../compartido/ipc';
import { llamar } from '../gula';
import { Conexion } from '../componentes/Conexion';
import { Carta } from './Carta';
import { Mesas } from './Mesas';
import { useSalon } from '../useSalon';

type Activa = Extract<EstadoSesion, { tipo: 'activa' }>;
type Seccion = 'mesas' | 'carta';
type Vista = { tipo: 'seccion' } | { tipo: 'mesa'; mesaId: string } | { tipo: 'mostrador' };

export function Shell({ sesion, sync }: { sesion: Activa; sync: EstadoSync }) {
  const [seccion, setSeccion] = useState<Seccion>('mesas');
  const [vista, setVista] = useState<Vista>({ tipo: 'seccion' });
  const { salon } = useSalon();
  return (
    <div className="shell">
      <header className="barra">
        <strong>{sesion.local.nombre}</strong>
        <Conexion estado={sync} />
        <span className="barra__usuario">{sesion.usuario.nombre}</span>
        <button type="button" className="boton" onClick={() => void llamar('sesion:bloquear')}>
          Cambiar usuario
        </button>
      </header>
      <nav className="menu" aria-label="Secciones">
        {(
          [
            ['mesas', 'Mesas'],
            ['carta', 'Carta'],
          ] as const
        ).map(([id, nombre]) => (
          <button
            key={id}
            type="button"
            className={seccion === id ? 'menu__item menu__item--activo' : 'menu__item'}
            aria-current={seccion === id ? 'page' : undefined}
            onClick={() => {
              setSeccion(id);
              setVista({ tipo: 'seccion' });
            }}
          >
            {nombre}
          </button>
        ))}
      </nav>
      <section className="contenido">
        {seccion === 'mesas' && vista.tipo === 'seccion' && (
          <Mesas
            salon={salon}
            onVerMesa={(mesaId) => setVista({ tipo: 'mesa', mesaId })}
            onMostrador={() => setVista({ tipo: 'mostrador' })}
          />
        )}
        {seccion === 'carta' && <Carta usuario={sesion.usuario} conexion={sync.conexion} />}
      </section>
    </div>
  );
}
