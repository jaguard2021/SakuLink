import { Router } from 'express';
import { getBalance } from '../controllers/walletController';
import { authenticate } from '../middlewares/auth'; 

const router = Router();

router.get('/balance', authenticate, getBalance);

export default router;