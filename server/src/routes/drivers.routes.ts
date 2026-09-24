import { Router } from 'express';
import * as driversController from '../controllers/drivers.controller.js';

export const driversRouter = Router();

driversRouter.get('/me/request', driversController.myRequest);
