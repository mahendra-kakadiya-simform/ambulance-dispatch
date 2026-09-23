import * as usersService from '../services/users.service.js';
import type { ValidatedRequestHandler } from '../middleware/validate.middleware.js';
import { UnauthenticatedError } from '../utils/errors.js';
import type { createUserSchema, listUsersSchema, updateUserPasswordSchema, updateUserSchema } from '../utils/validators.js';

export const list: ValidatedRequestHandler<typeof listUsersSchema> = async (req, res) => {
  const result = await usersService.listUsers(req.query);
  res.json(result);
};

export const create: ValidatedRequestHandler<typeof createUserSchema> = async (req, res) => {
  const user = await usersService.createUser(req.body);
  res.status(201).json({ user });
};

export const update: ValidatedRequestHandler<typeof updateUserSchema> = async (req, res) => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  const user = await usersService.updateUser(req.params.id, req.user.id, req.body);
  res.json({ user });
};

export const updatePassword: ValidatedRequestHandler<typeof updateUserPasswordSchema> = async (req, res) => {
  const user = await usersService.updateUserPassword(req.params.id, req.body.password);
  res.json({ user });
};
