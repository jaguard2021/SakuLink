import express from 'express';
import { initiateMoonPayOnramp } from '../controllers/moonpayController';
import { authenticate } from '../middlewares/auth';

const router = express.Router();

// Endpoint untuk user memulai pembelian USDC via MoonPay
router.post('/moonpay/onramp', authenticate, initiateMoonPayOnramp);

// (Opsional) Endpoint untuk cek status order
// router.get('/moonpay/order/:orderId', authenticate, getMoonPayOrderStatus);

export default router;