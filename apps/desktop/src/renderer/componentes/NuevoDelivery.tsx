import { useState } from 'react';
import { LIMITES_DELIVERY, NOTA_MAXIMA } from '@gula/shared';
import { llamar } from '../gula';
import { centavosAPesos, parsearPesos } from '../pesos';
import { TomarPedido } from './TomarPedido';

/** Alta de un delivery: primero el cliente (se completa solo si el teléfono ya pidió), después los productos. */
export function NuevoDelivery({
  envioPorDefecto,
  onCancelar,
  onCreado,
}: {
  envioPorDefecto: number;
  onCancelar: () => void;
  onCreado: (numero: number) => void;
}) {
  const [paso, setPaso] = useState<'datos' | 'productos'>('datos');
  const [telefono, setTelefono] = useState('');
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [referencias, setReferencias] = useState('');
  const [envio, setEnvio] = useState(centavosAPesos(envioPorDefecto));
  const [pagaCon, setPagaCon] = useState('');
  const [nota, setNota] = useState('');

  const costoEnvio = envio.trim() ? parsearPesos(envio) : 0;
  const paga = pagaCon.trim() ? parsearPesos(pagaCon) : null;
  const listo = nombre.trim() && direccion.trim() && costoEnvio !== null && (!pagaCon.trim() || paga !== null);

  const completar = () => {
    if (!telefono.trim()) return;
    void llamar('delivery:cliente', { telefono })
      .then((c) => {
        if (!c) return;
        setNombre((v) => v || c.nombre);
        setDireccion((v) => v || c.direccion);
        setReferencias((v) => v || c.referencias);
      })
      .catch(() => undefined);
  };

  if (paso === 'productos')
    return (
      <TomarPedido
        titulo={`Delivery · ${nombre.trim()}`}
        onCancelar={() => setPaso('datos')}
        onEnviar={async (items) => {
          const r = await llamar('delivery:crear', {
            cliente: { nombre: nombre.trim(), telefono: telefono.trim(), direccion: direccion.trim(), referencias: referencias.trim() },
            costoEnvio: costoEnvio!,
            pagaCon: paga,
            notas: nota.trim(),
            items,
          });
          onCreado(r.numero);
        }}
      />
    );

  return (
    <form
      className="modulo nuevo-delivery"
      aria-label="Nuevo delivery"
      onSubmit={(e) => {
        e.preventDefault();
        if (listo) setPaso('productos');
      }}
    >
      <h2 className="modulo__titulo">Nuevo delivery</h2>
      <p className="suave nuevo-delivery__ayuda">Con el teléfono se completan los datos de un cliente que ya pidió.</p>
      <label className="campo">
        Teléfono
        <input inputMode="tel" value={telefono} maxLength={LIMITES_DELIVERY.telefono} onChange={(e) => setTelefono(e.target.value)} onBlur={completar} />
      </label>
      <label className="campo">
        Nombre
        <input value={nombre} maxLength={LIMITES_DELIVERY.nombre} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label className="campo nuevo-delivery__ancho">
        Dirección
        <input value={direccion} maxLength={LIMITES_DELIVERY.direccion} onChange={(e) => setDireccion(e.target.value)} />
      </label>
      <label className="campo nuevo-delivery__ancho">
        Referencias
        <input value={referencias} maxLength={LIMITES_DELIVERY.referencias} placeholder="Piso, timbre, entre calles…" onChange={(e) => setReferencias(e.target.value)} />
      </label>
      <label className="campo">
        Envío
        <input className="cifra" inputMode="decimal" value={envio} onChange={(e) => setEnvio(e.target.value)} />
      </label>
      <label className="campo">
        Paga con (opcional)
        <input className="cifra" inputMode="decimal" value={pagaCon} onChange={(e) => setPagaCon(e.target.value)} />
      </label>
      {costoEnvio === null && <p className="error-texto nuevo-delivery__ancho">El envío no es un monto válido.</p>}
      {pagaCon.trim() && paga === null && <p className="error-texto nuevo-delivery__ancho">"Paga con" no es un monto válido.</p>}
      <label className="campo nuevo-delivery__ancho">
        Nota para la cocina
        <input value={nota} maxLength={NOTA_MAXIMA} onChange={(e) => setNota(e.target.value)} />
      </label>
      <div className="fila nuevo-delivery__ancho">
        <button type="submit" className="boton boton--linea" disabled={!listo}>
          Elegir productos
        </button>
        <button type="button" className="boton" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
