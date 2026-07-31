import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import userRoutes from './routes/userRoutes';
import authRoutes from './routes/authRoutes';
import depositRoutes from './routes/depositRoutes';
import remittanceRoutes from './routes/remittanceRoutes';
import automationRoutes from './routes/automationRoutes';
import walletRoutes from './routes/walletRoutes';
import onrampRoutes from './routes/onrampRoutes';
import moonpayRoutes from './routes/moonpayRoutes';

// ✅ Import Circle Mint
import { handleCircleMintWebhook } from './webhooks/circleMint';
import circleMintRoutes from './routes/circleMintRoutes';

import {
  handleHitPayWebhook,
  checkPaymentStatus,
} from './controllers/webhookController';
import { handleBalanceUpdateWebhook } from './controllers/balanceWebhookController';
import { handleTransFiWebhook } from './webhooks/transfi';
import { handleMoonPayWebhook } from './webhooks/moonpay';
import { startScheduler } from './scheduler';

// ✅ Import service Airwallex (digunakan di endpoint test)
import { getExchangeRate } from './services/airwallexService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ============================================================
// WEBHOOKS (must be before express.json())
// ============================================================

app.post(
  '/api/webhooks/hitpay',
  express.raw({ type: 'application/json' }),
  handleHitPayWebhook
);

app.post(
  '/api/webhooks/hitpay-balance',
  express.raw({ type: 'application/json' }),
  handleBalanceUpdateWebhook
);

app.post(
  '/api/webhooks/transfi',
  express.raw({ type: 'application/json' }),
  handleTransFiWebhook
);

app.post(
  '/api/webhooks/moonpay',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    (req as any).rawBody = req.body.toString('utf8');
    next();
  },
  handleMoonPayWebhook
);

// ✅ Circle Mint webhook (v1 via SNS)
// 🔥 Gunakan type: '*/*' karena SNS sering menggunakan Content-Type: text/plain
app.head('/api/webhooks/circle-mint', (req, res) => res.sendStatus(200));
app.post(
  '/api/webhooks/circle-mint',
  express.raw({ type: '*/*' }), // <-- perbaikan minor
  (req, res, next) => {
    (req as any).rawBody = req.body.toString('utf8');
    next();
  },
  handleCircleMintWebhook
);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ROUTES
// ============================================================
app.get('/health', (req, res) => {
  res.json({ status: 'SakuLink API is running 🚀' });
});

app.get('/api/webhooks/moonpay', (req, res) => {
  res.json({ message: 'MoonPay webhook route alive' });
});

// ✅ Endpoint test Airwallex
app.get('/api/airwallex/rate', async (req, res) => {
  try {
    const sellCurrency = (req.query.sellCurrency as string) || 'SGD';
    const buyCurrency = (req.query.buyCurrency as string) || 'USD';
    const amount = parseFloat(req.query.amount as string) || 100;

    const rate = await getExchangeRate({
      sellCurrency,
      buyCurrency,
      sellAmount: amount,
    });

    res.json({
      success: true,
      data: {
        from: sellCurrency,
        to: buyCurrency,
        amount: amount,
        rate: rate.rate,
        convertedAmount: rate.buyAmount,
      },
    });
  } catch (error: any) {
    console.error('Airwallex test error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Payment redirects (for TransFi, HitPay, MoonPay)
app.get(['/payment-complete', '/api/payment-complete'], (req, res) => {
  const { reference, payment_id } = req.query;
  res.send(`
    <div style="font-family: Arial; text-align:center; margin-top:80px;">
      <h1 style="color:#28a745;">Payment Successful</h1>
      <p>Reference: <b>${reference || payment_id || 'N/A'}</b></p>
    </div>
  `);
});

app.get('/success', (req, res) => {
  const { orderId, status } = req.query;
  res.send(`
    <div style="font-family: Arial; text-align:center; margin-top:80px;">
      <h1 style="color:#28a745;">SakuLink Onramp Success</h1>
      <p>Status: <b>${status || 'completed'}</b></p>
      <p>Order ID: <b>${orderId || 'N/A'}</b></p>
    </div>
  `);
});

app.get('/failure', (req, res) => {
  res.send(`
    <div style="font-family: Arial; text-align:center; margin-top:80px;">
      <h1 style="color:#dc3545;">Payment Failed</h1>
      <p>Please try again.</p>
    </div>
  `);
});

app.get('/api/webhooks/hitpay/status/:paymentId', checkPaymentStatus);

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/remittances', remittanceRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api', onrampRoutes);
app.use('/api', moonpayRoutes);

// ✅ Circle Mint router (endpoint protected)
app.use('/api', circleMintRoutes);

// ============================================================
// SCHEDULER & START
// ============================================================
startScheduler();

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 SakuLink API running on http://localhost:${PORT}`);
});