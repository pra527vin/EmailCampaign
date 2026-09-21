import type { RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and REPLACES the request parts with the parsed result, so handlers
 * receive coerced, trimmed, typed values rather than raw strings. Anything not
 * described by the schema is dropped, which keeps unexpected fields out of
 * Prisma calls.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) {
        // Express 4 exposes `query` as a plain object; reassigning is safe.
        Object.defineProperty(req, 'query', {
          value: schemas.query.parse(req.query),
          writable: true,
          configurable: true,
        });
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (error) {
      next(error instanceof ZodError ? error : error);
    }
  };
}
