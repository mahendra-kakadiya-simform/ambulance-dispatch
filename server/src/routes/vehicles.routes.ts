import { Router } from 'express';
import * as vehiclesController from '../controllers/vehicles.controller.js';
import { requireRole } from '../middleware/role.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  createVehicleSchema,
  getVehicleSchema,
  listVehiclesSchema,
  reportPositionSchema,
  updateVehicleSchema,
} from '../utils/validators.js';

export const vehiclesRouter = Router();

// Literal paths are registered before /:id so "positions" and "me" are never parsed as ids.
vehiclesRouter.get('/positions', requireRole('DISPATCHER', 'SUPER_ADMIN'), vehiclesController.listPositions);
vehiclesRouter.get('/me/position', requireRole('DRIVER'), vehiclesController.getMyPosition);
vehiclesRouter.post('/me/position', requireRole('DRIVER'), validate(reportPositionSchema), vehiclesController.reportPosition);

vehiclesRouter.get('/', validate(listVehiclesSchema), vehiclesController.list);
vehiclesRouter.get('/:id', validate(getVehicleSchema), vehiclesController.getById);

vehiclesRouter.post('/', requireRole('SUPER_ADMIN'), validate(createVehicleSchema), vehiclesController.create);
vehiclesRouter.patch('/:id', requireRole('SUPER_ADMIN'), validate(updateVehicleSchema), vehiclesController.update);
