import cors from 'cors';
import express, { type Express, Router } from 'express';
import { config } from './config/env.js';
import { authenticate } from './middleware/auth.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requireRole } from './middleware/role.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(cors({ origin: config.CORS_ORIGIN }));

  // Public — lives entirely outside /api, never touches the authenticated router.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const apiRouter = Router();

  // Applied before any module route is mounted, so every module added below —
  // today or next week — requires a valid token unless its path is explicitly
  // whitelisted inside auth.middleware.ts. Nothing has to opt in to protection;
  // a route can only opt out, deliberately and visibly.
  apiRouter.use(authenticate);

  apiRouter.use('/auth', authRouter);
  apiRouter.use('/users', requireRole('SUPER_ADMIN'), usersRouter);

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
}
