import { Router } from 'express';
import { getBalance, getFiatBalance } from '../controllers/walletController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// 🔹 Cek saldo crypto (USDC)
router.get('/balance', authenticate, getBalance);

// 🔹 Cek saldo fiat (SGD & USD) – ✅ baru
router.get('/fiat-balance', authenticate, getFiatBalance);

export default router;