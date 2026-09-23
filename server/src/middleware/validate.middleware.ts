import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z, type ZodTypeAny } from 'zod';
import { ValidationError } from '../utils/errors.js';

export interface ValidationSchemas<
  TParams extends ZodTypeAny = ZodTypeAny,
  TBody extends ZodTypeAny = ZodTypeAny,
  TQuery extends ZodTypeAny = ZodTypeAny,
> {
  params?: TParams;
  body?: TBody;
  query?: TQuery;
}

type InferOr<T extends ZodTypeAny | undefined, Fallback> = T extends ZodTypeAny ? z.infer<T> : Fallback;

/**
 * Give a controller this type (parameterized with its own schema object) instead of
 * `RequestHandler` — req.params/body/query come out typed as the Zod-inferred shape
 * instead of `any`, as long as the route uses `validate(schemas)` with the same object.
 */
export type ValidatedRequestHandler<S extends ValidationSchemas> = RequestHandler<
  InferOr<S['params'], ParamsDictionary>,
  any,
  InferOr<S['body'], unknown>,
  InferOr<S['query'], ParsedQs>
>;

export function validate<S extends ValidationSchemas>(schemas: S): ValidatedRequestHandler<S> {
  // Implemented loosely-typed and cast on return: the precise per-schema typing in
  // ValidatedRequestHandler<S> is what lets a route's validate(schema) and its controller
  // (also typed ValidatedRequestHandler<typeof schema>) unify into one handler chain —
  // Express's route() overloads need every handler in the chain to share the same
  // req.params/body/query generic shape, which a plain `RequestHandler` return type here
  // would break as soon as a schema's query differs from the ParsedQs default.
  const handler: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as ParamsDictionary;
      }

      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        // req.query is a getter-only accessor on Express 5's Request — it can't be
        // reassigned directly, so we redefine the property to hold our parsed value.
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError('Validation failed', z.flattenError(err).fieldErrors);
      }
      throw err;
    }
  };

  return handler as unknown as ValidatedRequestHandler<S>;
}
