import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { loginSchema } from '../utils/validators.js';

export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.get('/me', authController.me);
