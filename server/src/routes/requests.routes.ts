import { Router } from 'express';
import * as requestsController from '../controllers/requests.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { assignRequestSchema, createRequestSchema, getRequestSchema, listRequestsSchema } from '../utils/validators.js';

export const requestsRouter = Router();

requestsRouter.get('/', validate(listRequestsSchema), requestsController.list);
requestsRouter.post('/', validate(createRequestSchema), requestsController.create);
requestsRouter.get('/:id', validate(getRequestSchema), requestsController.getById);
requestsRouter.post('/:id/assign', validate(assignRequestSchema), requestsController.assign);
