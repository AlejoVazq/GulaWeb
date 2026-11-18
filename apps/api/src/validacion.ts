import { z } from 'zod';

export const email = z.string().trim().toLowerCase().pipe(z.email());
export const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200);
export const pin = z.string().regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos');
export const slug = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');
export const nombre = z.string().trim().min(1).max(80);
