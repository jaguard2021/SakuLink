import express from 'express';
import { initiateOnramp } from '../controllers/onrampController';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

router.post('/onramp', authenticate, initiateOnramp);

export default router;