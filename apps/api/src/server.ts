import { buildApp } from './app.js';
import { cargarConfig } from './config.js';

const config = cargarConfig(process.env);
const app = await buildApp(config);
await app.listen({ port: config.port, host: process.env.HOST ?? '0.0.0.0' });
