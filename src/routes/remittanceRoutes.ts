// src/routes/remittanceRoutes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { sendRemittance, getRemittanceHistory } from '../controllers/remittanceController';

const router = Router();

router.use(authenticate);

router.post('/send', sendRemittance);
router.get('/history', getRemittanceHistory);

export default router;