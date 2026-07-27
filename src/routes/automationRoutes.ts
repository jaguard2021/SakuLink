// src/routes/automationRoutes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  triggerAutomation,
  getAutomationStatus,
  manualTransfer,
} from '../controllers/automationController';

const router = Router();

router.use(authenticate);

router.post('/trigger', triggerAutomation);
router.get('/status', getAutomationStatus);
router.post('/manual-transfer', manualTransfer);

export default router;