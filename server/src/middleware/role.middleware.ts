import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '../generated/prisma/enums.js';
import { ForbiddenError, UnauthenticatedError } from '../utils/errors.js';

export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthenticatedError();
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError();
    }

    next();
  };
}
