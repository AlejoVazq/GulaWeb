import type { RespuestaPullCarta } from '../src/compartido/tipos';

export const T0 = '2026-11-18T10:00:00.000Z';
export const T1 = '2026-11-18T11:00:00.000Z';

export function pullDePrueba(extra: Partial<RespuestaPullCarta> = {}): RespuestaPullCarta {
  return {
    cursor: T1,
    sectores: [{ id: 's1', nombre: 'Cocina', orden: 0, actualizadoEn: T0, eliminadoEn: null }],
    categorias: [
      { id: 'c1', nombre: 'Pizzas', orden: 0, visible: true, horarioDesde: null, horarioHasta: null, actualizadoEn: T0, eliminadoEn: null },
    ],
    productos: [
      {
        id: 'p1', categoriaId: 'c1', sectorId: 's1', nombre: 'Muzza', descripcion: null, precio: 1200000,
        foto: null, disponible: true, visible: true, orden: 0, etiquetas: ['vegetariano'], actualizadoEn: T0, eliminadoEn: null,
      },
    ],
    grupos: [{ id: 'g1', productoId: 'p1', nombre: 'Tamaño', min: 1, max: 1, orden: 0, actualizadoEn: T0, eliminadoEn: null }],
    opciones: [{ id: 'o1', grupoId: 'g1', nombre: 'Grande', recargo: 200000, disponible: true, orden: 0, actualizadoEn: T0, eliminadoEn: null }],
    ...extra,
  };
}
