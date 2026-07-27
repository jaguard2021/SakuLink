import { Router } from 'express';
import { handleHitPayWebhook } from '../controllers/webhookController';

const router = Router();

router.post('/hitpay', handleHitPayWebhook);

export default router;