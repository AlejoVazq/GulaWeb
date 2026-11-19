import { useState } from 'react';
import type { EstadoSesion, EstadoSync } from '../../compartido/ipc';
import { llamar } from '../gula';
import { Conexion } from '../componentes/Conexion';
import { AvisoSync } from '../componentes/AvisoSync';
import { AvisoActualizacion } from '../componentes/AvisoActualizacion';
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
import { Delivery } from './Delivery';
import { Reportes } from './Reportes';
import { AvisoImpresion } from '../componentes/AvisoImpresion';
import { VistaPrevia } from '../componentes/VistaPrevia';
import { Cartel } from '../componentes/Cartel';
import { SECCIONES, resumenMesas, type Seccion } from '../secciones';

type Activa = Extract<EstadoSesion, { tipo: 'activa' }>;
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
  const ids: Seccion[] = [
    'mesas',
    ...(puede(sesion.usuario.rol, 'delivery.gestionar') === 'si' ? (['delivery'] as const) : []),
    ...(puede(sesion.usuario.rol, 'caja.operar') === 'si' ? (['caja'] as const) : []),
    ...(puede(sesion.usuario.rol, 'reportes.ver') === 'si' ? (['reportes'] as const) : []),
    'carta',
    ...(puede(sesion.usuario.rol, 'impresion.configurar') === 'si' ? (['impresion'] as const) : []),
  ];
  const mesaVista = vista.tipo === 'mesa' ? salon.mesas.find((m) => m.id === vista.mesaId) : undefined;
  const cartel = (): { placa: string; titulo?: string; resumen?: string } => {
    if (seccion === 'mesas') {
      if (vista.tipo === 'mostrador') return { placa: 'M', titulo: 'Mostrador', resumen: 'Pedido para retirar en la barra' };
      if (mesaVista) return { placa: mesaVista.nombre.replace(/^mesa\s*/i, ''), titulo: mesaVista.nombre };
      return resumenMesas(salon.mesas);
    }
    if (seccion === 'caja') return { placa: caja?.turno ? 'ABIERTA' : 'CERRADA' };
    return { placa: SECCIONES[seccion].nombre[0]! };
  };
  return (
    <div className={seccion === 'mesas' || sinAtender > 0 ? 'shell' : 'shell shell--sin-bandeja'}>
      <nav className="riel" aria-label="Secciones">
        <div className="riel__local">
          <span className="riel__nombre">{sesion.local.nombre}</span>
        </div>
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            className="riel__item"
            style={{ '--linea': SECCIONES[id].color } as React.CSSProperties}
            aria-current={seccion === id ? 'page' : undefined}
            onClick={() => {
              setSeccion(id);
              setVista({ tipo: 'seccion' });
            }}
          >
            <span className="riel__muestra" aria-hidden="true" />
            {SECCIONES[id].nombre}
          </button>
        ))}
        <p className="riel__pie">GulaWeb</p>
      </nav>
      <Cartel seccion={seccion} {...cartel()}>
        <Alerta activa={sinAtender > 0} cantidad={sinAtender} />
        <Conexion estado={sync} />
        <AvisoSync sync={sync} />
        <AvisoActualizacion />
        <span className="cartel__usuario">
          {sesion.usuario.nombre}
          <button type="button" className="boton boton--cartel" onClick={() => void llamar('sesion:bloquear')}>
            Cambiar usuario
          </button>
        </span>
      </Cartel>
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
        {seccion === 'delivery' && <Delivery rol={sesion.usuario.rol} />}
        {seccion === 'reportes' && <Reportes />}
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
      {(seccion === 'mesas' || sinAtender > 0) && <Pendientes salon={salon} />}
      <VistaPrevia />
    </div>
  );
}
