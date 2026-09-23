import { Router } from 'express';
import * as usersController from '../controllers/users.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { createUserSchema, listUsersSchema, updateUserPasswordSchema, updateUserSchema } from '../utils/validators.js';

export const usersRouter = Router();

usersRouter.get('/', validate(listUsersSchema), usersController.list);
usersRouter.post('/', validate(createUserSchema), usersController.create);
usersRouter.patch('/:id', validate(updateUserSchema), usersController.update);
usersRouter.patch('/:id/password', validate(updateUserPasswordSchema), usersController.updatePassword);
