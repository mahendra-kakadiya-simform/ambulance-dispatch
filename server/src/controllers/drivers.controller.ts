import type { Request, Response } from 'express';
import * as requestsService from '../services/requests.service.js';
import { UnauthenticatedError } from '../utils/errors.js';

export const myRequest = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  // 200 with null (rather than 204) keeps the client's response handling uniform.
  const request = await requestsService.getDriverCurrentRequest(req.user.id);
  res.json({ request });
};
