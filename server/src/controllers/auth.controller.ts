import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service.js';
import type { ValidatedRequestHandler } from '../middleware/validate.middleware.js';
import { UnauthenticatedError } from '../utils/errors.js';
import type { loginSchema } from '../utils/validators.js';

export const login: ValidatedRequestHandler<typeof loginSchema> = async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json(result);
};

export const me: RequestHandler = async (req, res) => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ user });
};
