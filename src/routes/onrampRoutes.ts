import express from 'express';
import { initiateOnramp, initiateCircleOnramp } from '../controllers/onrampController';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.post('/onramp', authenticate, initiateOnramp);
router.post('/onramp/circle', authenticate, initiateCircleOnramp);

export default router;