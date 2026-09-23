import * as requestsService from '../services/requests.service.js';
import type { ValidatedRequestHandler } from '../middleware/validate.middleware.js';
import { UnauthenticatedError } from '../utils/errors.js';
import type {
  assignRequestSchema,
  createRequestSchema,
  getRequestSchema,
  listRequestsSchema,
} from '../utils/validators.js';

export const list: ValidatedRequestHandler<typeof listRequestsSchema> = async (req, res) => {
  const result = await requestsService.listRequests(req.query);
  res.json(result);
};

export const getById: ValidatedRequestHandler<typeof getRequestSchema> = async (req, res) => {
  const request = await requestsService.getRequest(req.params.id);
  res.json({ request });
};

export const create: ValidatedRequestHandler<typeof createRequestSchema> = async (req, res) => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  const request = await requestsService.createRequest(req.user.id, req.body);
  res.status(201).json({ request });
};

export const assign: ValidatedRequestHandler<typeof assignRequestSchema> = async (req, res) => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  const result = await requestsService.assignRequest(req.params.id, req.user.id);
  res.status(201).json(result);
};
