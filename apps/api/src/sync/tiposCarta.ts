import { z } from 'zod';
import { cambiarDisponibilidadOpcion } from '../carta/opciones.rutas.js';
import { cambiarDisponibilidadProducto } from '../carta/productos.rutas.js';
import { registrarTipoOperacion } from './operaciones.js';

registrarTipoOperacion('producto.disponibilidad', {
  permiso: 'carta.disponibilidad',
  esquema: z.object({ productoId: z.uuid(), disponible: z.boolean() }),
  tema: 'carta',
  aplicar: async (tx, { sesion }, d) => {
    await cambiarDisponibilidadProducto(tx, sesion, d.productoId, d.disponible);
  },
});

registrarTipoOperacion('opcion.disponibilidad', {
  permiso: 'carta.disponibilidad',
  esquema: z.object({ opcionId: z.uuid(), disponible: z.boolean() }),
  tema: 'carta',
  aplicar: async (tx, _ctx, d) => {
    await cambiarDisponibilidadOpcion(tx, d.opcionId, d.disponible);
  },
});
