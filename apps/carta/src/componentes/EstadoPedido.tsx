import { useEffect, useState } from 'react';
import { formatearPrecio, type PedidoPublico } from '@gula/shared';
import { consultarPedido } from '../api';

export const CONSULTA_MS = 5_000;

const final = (p: PedidoPublico) => p.estado !== 'pendiente';

function texto(p: PedidoPublico): string {
  switch (p.estado) {
    case 'pendiente':
      return 'Enviado — esperando confirmación';
    case 'confirmado':
    case 'cobrado':
      return '¡Pedido confirmado!';
    case 'rechazado':
      return `No pudimos tomar tu pedido: ${p.motivoRechazo ?? 'consultá con la moza'}`;
    case 'anulado':
      return 'Tu pedido fue anulado. Consultá con la moza.';
  }
}

/** Estado de un pedido enviado; consulta cada 5 s (y al volver a la pestaña) hasta que se resuelve. */
export function EstadoPedido({ token, pedido: inicial }: { token: string; pedido: PedidoPublico }) {
  const [p, setP] = useState(inicial);

  useEffect(() => {
    if (final(p)) return;
    let vivo = true;
    const consultar = () =>
      void consultarPedido(p.id, token)
        .then((nuevo) => vivo && setP(nuevo))
        .catch(() => undefined);
    const t = setInterval(consultar, CONSULTA_MS);
    const alVolver = () => document.visibilityState !== 'hidden' && consultar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [p, token]);

  return (
    <section className={`estado-pedido estado-pedido--${p.estado}`} aria-live="polite">
      <p className="estado-pedido__texto">{texto(p)}</p>
      {p.estado === 'confirmado' && (
        <p className="estado-pedido__ayuda">Ya lo estamos preparando.</p>
      )}
      {p.items.length > 0 && (
        <ul className="estado-pedido__items">
          {p.items.map((i, n) => (
            <li key={n}>
              {i.cantidad}× {i.nombre}
              {i.resumenOpciones && ` (${i.resumenOpciones})`}
            </li>
          ))}
        </ul>
      )}
      {p.total > 0 && <p className="estado-pedido__total">{formatearPrecio(p.total)}</p>}
    </section>
  );
}
