import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatearPrecio } from '@gula/shared';
import { PapelComanda, selloDeEstado } from './index';

const linea = { id: 'a', cantidad: 2, nombre: 'Papas con cheddar', importe: 1600000 };

describe('PapelComanda', () => {
  it('muestra cantidad, nombre e importe de cada línea y el total', () => {
    render(<PapelComanda titulo="MESA 07" lineas={[linea]} total={1600000} />);
    expect(screen.getByText('2×')).toBeInTheDocument();
    expect(screen.getByText('Papas con cheddar')).toBeInTheDocument();
    expect(screen.getAllByText(formatearPrecio(1600000))).toHaveLength(2);
  });

  it('sin total no dibuja la regla de total', () => {
    render(<PapelComanda titulo="MESA 07" lineas={[linea]} />);
    expect(screen.queryByText(/total/i)).toBeNull();
  });

  it('muestra el detalle (opciones y nota) bajo el nombre', () => {
    render(<PapelComanda titulo="MESA 07" lineas={[{ ...linea, detalle: 'Grande · “sin sal”' }]} />);
    expect(screen.getByText('Grande · “sin sal”')).toBeInTheDocument();
  });

  it('el sello se anuncia como estado', () => {
    render(<PapelComanda titulo="PEDIDO" lineas={[linea]} sello={selloDeEstado('confirmado')} />);
    expect(screen.getByRole('status')).toHaveTextContent('CONFIRMADO');
  });

  it('una línea quitada queda tachada, no desaparece', () => {
    render(<PapelComanda titulo="MESA 07" lineas={[{ ...linea, quitada: true }]} />);
    expect(screen.getByText('Papas con cheddar').closest('li')).toHaveClass('papel__linea--quitada');
  });

  it('nombres y notas de 140 caracteres no rompen la estructura', () => {
    const largo = 'Gin Beefeater con agua tónica, pepino y pimienta rosa '.repeat(3).slice(0, 140);
    render(<PapelComanda titulo="MESA 07" lineas={[{ ...linea, nombre: largo, detalle: largo }]} total={1} />);
    const li = screen.getAllByText(largo)[0]!.closest('li')!;
    expect(li).toHaveTextContent(largo);
    expect(li.querySelectorAll('.papel__nombre')).toHaveLength(1);
  });

  it('muestra el nombre del local, título, subtítulo y lo que va en el pie', () => {
    render(
      <PapelComanda local="Gula" titulo="MESA 07" subtitulo="21:42 · COMANDA" lineas={[linea]}>
        <button type="button">Mandar a la barra</button>
      </PapelComanda>,
    );
    expect(screen.getByText('Gula')).toBeInTheDocument();
    expect(screen.getByText('MESA 07')).toBeInTheDocument();
    expect(screen.getByText('21:42 · COMANDA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mandar a la barra' })).toBeInTheDocument();
  });

  it('accionesLinea dibuja los controles de cada línea', () => {
    render(<PapelComanda titulo="MESA 07" lineas={[linea]} accionesLinea={(l) => <button type="button">Sumar {l.nombre}</button>} />);
    expect(screen.getByRole('button', { name: 'Sumar Papas con cheddar' })).toBeInTheDocument();
  });
});

describe('selloDeEstado', () => {
  it.each([
    ['pendiente', 'ENVIADO', 'neutro'],
    ['confirmado', 'CONFIRMADO', 'ok'],
    ['cobrado', 'CONFIRMADO', 'ok'],
    ['rechazado', 'RECHAZADO', 'mal'],
    ['anulado', 'ANULADO', 'mal'],
  ] as const)('%s → %s', (estado, texto, tono) => {
    expect(selloDeEstado(estado)).toEqual({ texto, tono });
  });
});
