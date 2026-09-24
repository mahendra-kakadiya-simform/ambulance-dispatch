import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import type { Role } from '../generated/prisma/enums.js';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors.js';

// Generic so that, called inline in a route chain, it takes on the same params/body/query
// types as the validate() and controller handlers next to it — TypeScript 7's overload
// resolution for router.get(...) fails when handlers in one chain disagree on those.
export function requireRole<P = ParamsDictionary, ResBody = any, ReqBody = any, Q = ParsedQs>(
  ...roles: Role[]
): RequestHandler<P, ResBody, ReqBody, Q> {
  return (req: Request<P, ResBody, ReqBody, Q>, _res: Response<ResBody>, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthenticatedError();
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError();
    }

    next();
  };
}
