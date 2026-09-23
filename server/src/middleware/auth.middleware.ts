import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../config/db.js';
import { UnauthenticatedError } from '../utils/errors.js';

// Paths (relative to wherever this middleware is mounted) that don't require a token.
// This is the ONLY way a route can skip authentication — everything else fails closed.
const PUBLIC_PATHS = new Set(['/auth/login']);

interface AccessTokenPayload {
  userId: string;
  role: string;
}

export const authenticate: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    throw new UnauthenticatedError('Missing authentication token');
  }

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthenticatedError('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) {
    throw new UnauthenticatedError('Invalid or expired token');
  }

  req.user = { id: user.id, role: user.role };
  next();
};
