import { nuevoId } from '@gula/shared';
import { conLocal } from '../src/db/conLocal.js';
import { categorias, gruposOpciones, mesas, opciones, productos, sectores, sesionesMesa } from '../src/db/schema/index.js';
import { nuevoToken } from '../src/salon/mesas.rutas.js';
import { dbs } from './db.js';

export type CartaChica = {
  cocina: string;
  hamburguesa: string;
  tamano: string;
  chica: string;
  grande: string;
  agua: string;
  pizza: string;
  muzza: string;
};

/** Hamburguesa $5000 (Tamaño obligatorio: Chica +0 / Grande +1500), Agua sin stock, Pizza con su propio grupo. */
export async function cartaChica(localId: string): Promise<CartaChica> {
  const c: CartaChica = {
    cocina: nuevoId(),
    hamburguesa: nuevoId(),
    tamano: nuevoId(),
    chica: nuevoId(),
    grande: nuevoId(),
    agua: nuevoId(),
    pizza: nuevoId(),
    muzza: nuevoId(),
  };
  const categoriaId = nuevoId();
  const gPizza = nuevoId();
  await conLocal(dbs.dbApp, localId, async (tx) => {
    await tx.insert(sectores).values({ id: c.cocina, localId, nombre: 'Cocina' });
    await tx.insert(categorias).values({ id: categoriaId, localId, nombre: 'Comidas' });
    await tx.insert(productos).values([
      { id: c.hamburguesa, localId, categoriaId, sectorId: c.cocina, nombre: 'Hamburguesa', precio: 500000 },
      { id: c.agua, localId, categoriaId, nombre: 'Agua', precio: 150000, disponible: false },
      { id: c.pizza, localId, categoriaId, sectorId: c.cocina, nombre: 'Pizza', precio: 900000 },
    ]);
    await tx.insert(gruposOpciones).values([
      { id: c.tamano, localId, productoId: c.hamburguesa, nombre: 'Tamaño', min: 1, max: 1 },
      { id: gPizza, localId, productoId: c.pizza, nombre: 'Gusto', min: 0, max: 1 },
    ]);
    await tx.insert(opciones).values([
      { id: c.chica, localId, grupoId: c.tamano, nombre: 'Chica', recargo: 0, orden: 0 },
      { id: c.grande, localId, grupoId: c.tamano, nombre: 'Grande', recargo: 150000, orden: 1 },
      { id: c.muzza, localId, grupoId: gPizza, nombre: 'Muzza', recargo: 0 },
    ]);
  });
  return c;
}

export async function mesaDePrueba(localId: string, nombre = 'Mesa 1', abierta = true) {
  const mesa = { id: nuevoId(), token: nuevoToken() };
  const sesionId = nuevoId();
  await conLocal(dbs.dbApp, localId, async (tx) => {
    await tx.insert(mesas).values({ id: mesa.id, localId, nombre, token: mesa.token });
    if (abierta) await tx.insert(sesionesMesa).values({ id: sesionId, localId, mesaId: mesa.id, estado: 'abierta' });
  });
  return { ...mesa, sesionId: abierta ? sesionId : null };
}
