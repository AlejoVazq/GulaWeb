export const ROLES = ['dueno', 'encargado', 'mesero'] as const;
export type Rol = (typeof ROLES)[number];
