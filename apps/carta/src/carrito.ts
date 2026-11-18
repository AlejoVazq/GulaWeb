import { useEffect, useReducer } from 'react';
import type { Seleccion } from '@gula/shared';

export type ItemCarrito = {
  clave: string;
  productoId: string;
  nombre: string;
  seleccion: Seleccion;
  resumenOpciones: string;
  nota: string;
  cantidad: number;
  precioUnitario: number;
};

export type AccionCarrito =
  | { tipo: 'agregar'; item: ItemCarrito }
  | { tipo: 'cantidad'; clave: string; cantidad: number }
  | { tipo: 'quitar'; clave: string }
  | { tipo: 'vaciar' };

/** Mismo producto + misma selección (sin importar el orden) + misma nota = misma línea. */
export function claveItem(i: Pick<ItemCarrito, 'productoId' | 'seleccion' | 'nota'>): string {
  const sel = Object.keys(i.seleccion)
    .sort()
    .map((g) => `${g}:${[...(i.seleccion[g] ?? [])].sort().join(',')}`)
    .join('|');
  return `${i.productoId}#${sel}#${i.nota.trim()}`;
}

export function reducirCarrito(estado: ItemCarrito[], accion: AccionCarrito): ItemCarrito[] {
  switch (accion.tipo) {
    case 'agregar': {
      const clave = claveItem(accion.item);
      const existe = estado.find((i) => i.clave === clave);
      if (existe) {
        return estado.map((i) => (i.clave === clave ? { ...i, cantidad: i.cantidad + accion.item.cantidad } : i));
      }
      return [...estado, { ...accion.item, clave }];
    }
    case 'cantidad':
      return accion.cantidad <= 0
        ? estado.filter((i) => i.clave !== accion.clave)
        : estado.map((i) => (i.clave === accion.clave ? { ...i, cantidad: accion.cantidad } : i));
    case 'quitar':
      return estado.filter((i) => i.clave !== accion.clave);
    case 'vaciar':
      return [];
  }
}

export const totalCarrito = (items: ItemCarrito[]) => items.reduce((t, i) => t + i.precioUnitario * i.cantidad, 0);
export const unidadesCarrito = (items: ItemCarrito[]) => items.reduce((t, i) => t + i.cantidad, 0);

const claveStorage = (slug: string) => `gula:carrito:${slug}`;

function leer(slug: string): ItemCarrito[] {
  try {
    const crudo = sessionStorage.getItem(claveStorage(slug));
    return crudo ? (JSON.parse(crudo) as ItemCarrito[]) : [];
  } catch {
    return [];
  }
}

/** Carrito persistido en sessionStorage (si está disponible). */
export function useCarrito(slug: string) {
  const [items, despachar] = useReducer(reducirCarrito, slug, leer);
  useEffect(() => {
    try {
      sessionStorage.setItem(claveStorage(slug), JSON.stringify(items));
    } catch {
      /* almacenamiento no disponible: el carrito vive solo en memoria */
    }
  }, [slug, items]);
  return { items, despachar };
}
