import type { CartaLocal } from '../compartido/tipos';

/** Carta chica para los tests del salón. */
export const cartaSalon: CartaLocal = {
  sectores: [],
  categorias: [
    {
      id: 'c1', nombre: 'Hamburguesas', orden: 0, visible: true, horarioDesde: null, horarioHasta: null,
      productos: [
        {
          id: 'p1', categoriaId: 'c1', sectorId: null, nombre: 'Clásica', descripcion: null, precio: 500000, foto: null,
          disponible: true, visible: true, orden: 0, etiquetas: [],
          grupos: [
            {
              id: 'g1', productoId: 'p1', nombre: 'Tamaño', min: 1, max: 1, orden: 0,
              opciones: [
                { id: 'o1', grupoId: 'g1', nombre: 'Simple', recargo: 0, disponible: true, orden: 0 },
                { id: 'o2', grupoId: 'g1', nombre: 'Doble', recargo: 200000, disponible: true, orden: 1 },
              ],
            },
          ],
        },
        {
          id: 'p2', categoriaId: 'c1', sectorId: null, nombre: 'Agua', descripcion: null, precio: 150000, foto: null,
          disponible: false, visible: true, orden: 1, etiquetas: [], grupos: [],
        },
      ],
    },
    {
      id: 'c2', nombre: 'Bebidas', orden: 1, visible: true, horarioDesde: null, horarioHasta: null,
      productos: [
        {
          id: 'p3', categoriaId: 'c2', sectorId: null, nombre: 'Gaseosa', descripcion: null, precio: 250000, foto: null,
          disponible: true, visible: true, orden: 0, etiquetas: [], grupos: [],
        },
      ],
    },
  ],
};
