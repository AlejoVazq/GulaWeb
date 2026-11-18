import { migrar } from './migrar.js';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL es obligatoria');
await migrar(url);
console.log('Migraciones aplicadas');
