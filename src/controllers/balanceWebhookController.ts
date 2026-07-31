// src/controllers/balanceWebhookController.ts
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import prisma from '../lib/prisma';
import { getExchangeRate } from '../services/airwallexService';

export const handleBalanceUpdateWebhook = async (
  req: ExpressRequest,
  res: ExpressResponse
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body);
    const event = JSON.parse(rawBody);

    const paymentId = event.payment_request_id || event.id || event.paymentId;
    const eventStatus = event.status;

    console.log('📨 Webhook HitPay Balance received:', { paymentId, eventStatus, rawBody });

    if (!paymentId) {
      console.warn('❌ Missing payment identifier');
      return res.status(400).json({ error: 'Missing payment identifier' });
    }

    // Hanya proses jika pembayaran sukses
    if (eventStatus === 'completed' || eventStatus === 'success') {
      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        include: { user: true },
      });

      console.log('🔍 Payment found?', !!payment);
      if (payment) {
        console.log(`   Amount: ${payment.amount}, Currency: ${payment.currency}, UserId: ${payment.userId}`);
      }

      if (!payment || !payment.user) {
        console.warn('❌ Payment or user not found');
        return res.status(404).json({ error: 'Payment or user not found' });
      }

      const amountNum = Number(payment.amount);
      const currencyStr = payment.currency.toUpperCase();

      // Konversi ke USD via Airwallex
      let usdAmount: number;

      if (currencyStr === 'USD') {
        usdAmount = amountNum;
      } else {
        try {
          const rate = await getExchangeRate({
            sellCurrency: currencyStr,
            buyCurrency: 'USD',
            sellAmount: amountNum,
          });
          usdAmount = Number((amountNum * rate.rate).toFixed(2));
          console.log(`💱 Conversion: ${amountNum} ${currencyStr} → ${usdAmount} USD`);
        } catch (fxError) {
          console.error('❌ Airwallex FX failed, using fallback rate:', fxError);
          usdAmount = Number((amountNum * 0.745).toFixed(2));
        }
      }

      // Update FiatAccount (upsert)
      try {
        const updated = await prisma.fiatAccount.upsert({
          where: { userId: payment.user.id },
          update: {
            currency: currencyStr,
            localAmount: { increment: amountNum },
            usdBalance: { increment: usdAmount },
          },
          create: {
            userId: payment.user.id,
            currency: currencyStr,
            localAmount: amountNum,
            usdBalance: usdAmount,
          },
        });
        console.log(`✅ FiatAccount updated for user ${payment.user.id}: local ${updated.localAmount}, usd ${updated.usdBalance}`);
      } catch (upsertError) {
        console.error('❌ FiatAccount upsert error:', upsertError);
        throw upsertError;
      }
    } else {
      console.log(`ℹ️ Event status ${eventStatus} ignored (not completed/success)`);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};