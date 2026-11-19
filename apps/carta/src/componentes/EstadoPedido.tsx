import { useEffect, useState } from 'react';
import type { PedidoPublico } from '@gula/shared';
import { PapelComanda, selloDeEstado } from '@gula/ui';
import { consultarPedido } from '../api';

export const CONSULTA_MS = 5_000;

const final = (p: PedidoPublico) => p.estado !== 'pendiente';

function ayuda(p: PedidoPublico): string | null {
  switch (p.estado) {
    case 'pendiente':
      return 'Esperando que lo confirmen en la barra.';
    case 'confirmado':
    case 'cobrado':
      return 'Ya lo estamos preparando.';
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
    <section className="talon" aria-live="polite">
      <PapelComanda
        compacto
        titulo="PEDIDO"
        lineas={p.items.map((i, n) => ({
          id: String(n),
          cantidad: i.cantidad,
          nombre: i.nombre,
          importe: i.subtotal,
          detalle: i.resumenOpciones || undefined,
        }))}
        total={p.total > 0 ? p.total : undefined}
        sello={selloDeEstado(p.estado)}
      >
        <p className="talon__ayuda">{ayuda(p)}</p>
      </PapelComanda>
    </section>
  );
}
