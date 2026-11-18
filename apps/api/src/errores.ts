import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class ErrorApi extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export function cuerpoError(codigo: string, mensaje: string) {
  return { error: { codigo, mensaje } };
}

export function registrarErrores(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | ErrorApi | ZodError, req, reply) => {
    if (err instanceof ErrorApi) {
      return reply.status(err.status).send(cuerpoError(err.codigo, err.message));
    }
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send(cuerpoError('DATOS_INVALIDOS', 'Los datos enviados no son válidos.'));
    }
    if (err.statusCode === 429) {
      return reply
        .status(429)
        .send(
          cuerpoError('DEMASIADOS_INTENTOS', 'Demasiados intentos. Probá de nuevo en un minuto.'),
        );
    }
    if (err.statusCode === 413) {
      return reply
        .status(413)
        .send(cuerpoError('ARCHIVO_GRANDE', 'El archivo es demasiado grande (máximo 8 MB).'));
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send(cuerpoError('PEDIDO_INVALIDO', err.message));
    }
    req.log.error(err);
    return reply.status(500).send(cuerpoError('ERROR_INTERNO', 'Ocurrió un error inesperado.'));
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send(cuerpoError('NO_ENCONTRADO', 'No encontramos lo que buscás.')),
  );
}
