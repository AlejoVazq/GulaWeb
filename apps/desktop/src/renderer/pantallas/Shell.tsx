import { useState } from 'react';
import type { EstadoSesion, EstadoSync } from '../../compartido/ipc';
import { llamar } from '../gula';
import { Conexion } from '../componentes/Conexion';
import { Carta } from './Carta';
import { Mesas } from './Mesas';
import { DetalleMesa } from './DetalleMesa';
import { TomarPedido } from '../componentes/TomarPedido';
import { Alerta } from '../componentes/Alerta';
import { Pendientes } from '../componentes/Pendientes';
import type { Pedido, Salon } from '../../compartido/salon';
import { useCaja } from '../useCaja';
import { Cobrar } from '../componentes/Cobrar';
import { puede } from '@gula/shared';
import { Impresion } from './Impresion';
import { Caja } from './Caja';
import { AvisoImpresion } from '../componentes/AvisoImpresion';
import { VistaPrevia } from '../componentes/VistaPrevia';

type Activa = Extract<EstadoSesion, { tipo: 'activa' }>;
type Seccion = 'mesas' | 'caja' | 'carta' | 'impresion';
type Vista = { tipo: 'seccion' } | { tipo: 'mesa'; mesaId: string } | { tipo: 'mostrador' };

export function Shell({ sesion, sync, salon }: { sesion: Activa; sync: EstadoSync; salon: Salon }) {
  const [seccion, setSeccion] = useState<Seccion>('mesas');
  const [vista, setVista] = useState<Vista>({ tipo: 'seccion' });
  const [aviso, setAviso] = useState<string | null>(null);
  const volver = () => setVista({ tipo: 'seccion' });
  const sinAtender = salon.pendientes.length + salon.avisos.length;
  const puedeCobrar = puede(sesion.usuario.rol, 'cobro.registrar') === 'si';
  const { caja } = useCaja();
  const [cobrandoMostrador, setCobrandoMostrador] = useState<Pedido | null>(null);
  const secciones: [Seccion, string][] = [
    ['mesas', 'Mesas'],
    ...(puede(sesion.usuario.rol, 'caja.operar') === 'si' ? [['caja', 'Caja'] as [Seccion, string]] : []),
    ['carta', 'Carta'],
    ...(puede(sesion.usuario.rol, 'impresion.configurar') === 'si' ? [['impresion', 'Impresión'] as [Seccion, string]] : []),
  ];
  return (
    <div className="shell">
      <header className={sinAtender ? 'barra barra--alerta' : 'barra'}>
        <strong>{sesion.local.nombre}</strong>
        <Conexion estado={sync} />
        <Alerta activa={sinAtender > 0} cantidad={sinAtender} />
        <span className="barra__usuario">{sesion.usuario.nombre}</span>
        <button type="button" className="boton" onClick={() => void llamar('sesion:bloquear')}>
          Cambiar usuario
        </button>
      </header>
      <nav className="menu" aria-label="Secciones">
        {secciones.map(([id, nombre]) => (
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
      <AvisoImpresion />
      <section className="contenido">
        {aviso && seccion === 'mesas' && vista.tipo === 'seccion' && (
          <p className="ok" role="status">
            {aviso}
          </p>
        )}
        {seccion === 'mesas' && vista.tipo === 'mesa' && (
          <DetalleMesa mesaId={vista.mesaId} onVolver={volver} rol={sesion.usuario.rol} />
        )}
        {seccion === 'mesas' && vista.tipo === 'mostrador' && (
          <TomarPedido
            titulo="Mostrador"
            onCancelar={volver}
            onEnviar={async (items) => {
              const r = await llamar('salon:crearPedido', { origen: 'mostrador', items });
              setAviso(`Pedido de mostrador ${r.numero} enviado.`);
              volver();
            }}
          />
        )}
        {seccion === 'mesas' && vista.tipo === 'seccion' && (
          <Mesas
            salon={salon}
            onVerMesa={(mesaId) => {
              setAviso(null);
              setVista({ tipo: 'mesa', mesaId });
            }}
            onMostrador={() => setVista({ tipo: 'mostrador' })}
            porCobrar={caja?.porCobrar ?? []}
            onCobrar={puedeCobrar ? setCobrandoMostrador : undefined}
          />
        )}
        {seccion === 'carta' && <Carta usuario={sesion.usuario} conexion={sync.conexion} />}
        {seccion === 'impresion' && <Impresion />}
        {seccion === 'caja' && <Caja />}
      </section>
      {cobrandoMostrador && (
        <Cobrar
          titulo={`pedido ${cobrandoMostrador.numero ?? ''}`.trim()}
          subtotal={cobrandoMostrador.total}
          destino={{ pedidoId: cobrandoMostrador.id }}
          onCancelar={() => setCobrandoMostrador(null)}
          onListo={() => {
            setAviso(`Pedido ${cobrandoMostrador.numero ?? ''} cobrado.`);
            setCobrandoMostrador(null);
          }}
        />
      )}
      <Pendientes salon={salon} />
      <VistaPrevia />
    </div>
  );
}
