import type { Request, Response } from 'express';
import * as vehiclesService from '../services/vehicles.service.js';
import type { ValidatedRequestHandler } from '../middleware/validate.middleware.js';
import { UnauthenticatedError } from '../utils/errors.js';
import type {
  createVehicleSchema,
  getVehicleSchema,
  listVehiclesSchema,
  reportPositionSchema,
  updateVehicleSchema,
} from '../utils/validators.js';

export const list: ValidatedRequestHandler<typeof listVehiclesSchema> = async (req, res) => {
  const result = await vehiclesService.listVehicles(req.query);
  res.json(result);
};

export const getById: ValidatedRequestHandler<typeof getVehicleSchema> = async (req, res) => {
  const vehicle = await vehiclesService.getVehicle(req.params.id);
  res.json({ vehicle });
};

export const create: ValidatedRequestHandler<typeof createVehicleSchema> = async (req, res) => {
  const vehicle = await vehiclesService.createVehicle(req.body);
  res.status(201).json({ vehicle });
};

export const update: ValidatedRequestHandler<typeof updateVehicleSchema> = async (req, res) => {
  const vehicle = await vehiclesService.updateVehicle(req.params.id, req.body);
  res.json({ vehicle });
};

export const reportPosition: ValidatedRequestHandler<typeof reportPositionSchema> = async (req, res) => {
  if (!req.user) {
    throw new UnauthenticatedError();
  }
  const position = await vehiclesService.reportPosition(req.user.id, req.body);
  res.json({ position });
};

export const listPositions = async (_req: Request, res: Response): Promise<void> => {
  const positions = await vehiclesService.listCurrentPositions();
  res.json({ data: positions });
};
