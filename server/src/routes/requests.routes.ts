import { Router } from 'express';
import * as requestsController from '../controllers/requests.controller.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  assignRequestSchema,
  createRequestSchema,
  getRequestSchema,
  listRequestsSchema,
  overrideAssignmentSchema,
  requestHistorySchema,
  transitionRequestSchema,
} from '../utils/validators.js';

export const requestsRouter = Router();

// Drivers may call GET /:id, GET /:id/history and PATCH /:id/state, but only for their own request — the
// service layer enforces ownership (see assertDriverOwnsRequest in requests.service.ts).
// requireRole is called inline so it picks up each route's handler types.

requestsRouter.get('/', requireRole('DISPATCHER', 'SUPER_ADMIN'), validate(listRequestsSchema), requestsController.list);
requestsRouter.post('/', requireRole('DISPATCHER', 'SUPER_ADMIN'), validate(createRequestSchema), requestsController.create);
requestsRouter.get('/:id', requireRole('DISPATCHER', 'SUPER_ADMIN', 'DRIVER'), validate(getRequestSchema), requestsController.getById);
requestsRouter.post('/:id/assign', requireRole('DISPATCHER', 'SUPER_ADMIN'), validate(assignRequestSchema), requestsController.assign);
requestsRouter.post('/:id/override', requireRole('DISPATCHER', 'SUPER_ADMIN'), validate(overrideAssignmentSchema), requestsController.override);
requestsRouter.patch('/:id/state', requireRole('DISPATCHER', 'SUPER_ADMIN', 'DRIVER'), validate(transitionRequestSchema), requestsController.transition);
requestsRouter.get('/:id/history', requireRole('DISPATCHER', 'SUPER_ADMIN', 'DRIVER'), validate(requestHistorySchema), requestsController.history);
