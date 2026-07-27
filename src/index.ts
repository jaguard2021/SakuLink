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

import {
  handleHitPayWebhook,
  checkPaymentStatus,
} from './controllers/webhookController';

import { handleBalanceUpdateWebhook } from './controllers/balanceWebhookController';
import { handleTransFiWebhook } from './webhooks/transfi';
import { startScheduler } from './scheduler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

/**
 * Webhook routes must be registered before JSON middleware
 * because providers send raw payloads for signature validation.
 */
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'SakuLink API is running',
  });
});

/**
 * Payment redirect handlers
 */
app.get(
  ['/payment-complete', '/api/payment-complete'],
  (req, res) => {
    const {
      reference,
      payment_id,
    } = req.query;

    res.send(`
      <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 80px;">
        <h1 style="color:#28a745;">
          Payment Successful
        </h1>

        <p>
          Your payment has been received and is being processed.
        </p>

        <p>
          Reference:
          <b>${reference || payment_id || 'N/A'}</b>
        </p>
      </div>
    `);
  }
);

/**
 * TransFi onramp success callback
 */
app.get('/success', (req, res) => {
  const {
    orderId,
    status,
  } = req.query;

  res.send(`
    <div style="font-family: Arial, sans-serif; text-align:center; margin-top:80px;">
      <h1 style="color:#28a745;">
        SakuLink Onramp Success
      </h1>

      <p>
        USDC settlement has been processed to SakuLink treasury wallet.
      </p>

      <p>
        Status:
        <b>${status || 'completed'}</b>
        <br/>
        Order ID:
        <b>${orderId || 'N/A'}</b>
      </p>
    </div>
  `);
});

/**
 * TransFi onramp failure callback
 */
app.get('/failure', (req, res) => {
  res.send(`
    <div style="font-family: Arial, sans-serif; text-align:center; margin-top:80px;">
      <h1 style="color:#dc3545;">
        SakuLink Payment Failed
      </h1>

      <p>
        The transaction could not be completed.
      </p>
    </div>
  `);
});

app.get(
  '/api/webhooks/hitpay/status/:paymentId',
  checkPaymentStatus
);

/**
 * API routes
 */
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/remittances', remittanceRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api', onrampRoutes);

/**
 * Background automation scheduler
 */
startScheduler();

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(
    `SakuLink API running on http://localhost:${PORT}`
  );
});