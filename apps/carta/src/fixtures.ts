import type { CartaPublica } from '@gula/shared';

export const cartaDePrueba: CartaPublica = {
  local: { nombre: 'Bar La Gula', slug: 'la-gula', marca: {} },
  categorias: [
    {
      id: 'c1',
      nombre: 'Hamburguesas',
      enHorario: true,
      horario: null,
      productos: [
        {
          id: 'p1',
          nombre: 'Hamburguesa clásica',
          descripcion: 'Con papas',
          precio: 500000,
          foto: null,
          disponible: true,
          etiquetas: ['picante'],
          grupos: [
            {
              id: 'tamano',
              nombre: 'Tamaño',
              min: 1,
              max: 1,
              opciones: [
                { id: 'simple', nombre: 'Simple', recargo: 0, disponible: true },
                { id: 'grande', nombre: 'Grande', recargo: 150000, disponible: true },
              ],
            },
            {
              id: 'extras',
              nombre: 'Extras',
              min: 0,
              max: 2,
              opciones: [
                { id: 'cheddar', nombre: 'Cheddar', recargo: 80000, disponible: true },
                { id: 'bacon', nombre: 'Bacon', recargo: 100000, disponible: true },
                { id: 'huevo', nombre: 'Huevo', recargo: 50000, disponible: true },
              ],
            },
          ],
        },
        {
          id: 'p2',
          nombre: 'Papas con cheddar',
          descripcion: null,
          precio: 250000,
          foto: null,
          disponible: false,
          etiquetas: [],
          grupos: [],
        },
      ],
    },
    {
      id: 'c2',
      nombre: 'Desayunos',
      enHorario: false,
      horario: { desde: '08:00', hasta: '12:00' },
      productos: [
        {
          id: 'p3',
          nombre: 'Café con leche',
          descripcion: null,
          precio: 300000,
          foto: null,
          disponible: true,
          etiquetas: [],
          grupos: [],
        },
      ],
    },
  ],
};
