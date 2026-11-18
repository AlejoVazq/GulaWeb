import { migrar } from '../src/db/migrar.js';
import { envValido } from './helpers.js';

export default async function setup(): Promise<void> {
  await migrar(envValido.DATABASE_ADMIN_URL);
}
