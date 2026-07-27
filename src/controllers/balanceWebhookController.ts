// src/controllers/balanceWebhookController.ts

import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { convertCurrency } from '../services/exchangeRateService';

export const handleBalanceUpdateWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);

    const event = JSON.parse(rawBody);

    const paymentId =
      event.payment_request_id ||
      event.id ||
      event.paymentId;

    const eventStatus = event.status;

    if (!paymentId) {
      return res.status(400).json({
        error: 'Missing payment identifier',
      });
    }

    if (eventStatus === 'completed' || eventStatus === 'success') {
      const payment = await prisma.payment.findUnique({
        where: {
          paymentId,
        },
        include: {
          user: {
            include: {
              fiatAccount: true,
            },
          },
        },
      });

      if (!payment || !payment.user) {
        return res.status(404).json({
          error: 'Payment or user not found',
        });
      }

      const convertedUsd = await convertCurrency(
        payment.amount,
        payment.currency,
        'USD'
      );

      const finalUsd = Number(convertedUsd.toFixed(2));
      const amountNum = Number(payment.amount);
      const currencyStr = payment.currency.toUpperCase();

      await prisma.fiatAccount.upsert({
        where: {
          userId: payment.user.id,
        },
        update: {
          currency: currencyStr,
          localAmount: {
            increment: amountNum,
          },
          usdBalance: {
            increment: finalUsd,
          },
        },
        create: {
          userId: payment.user.id,
          currency: currencyStr,
          localAmount: amountNum,
          usdBalance: finalUsd,
        },
      });

      console.log(
        `[BALANCE WEBHOOK] HitPay payment success recorded: +${amountNum} ${currencyStr} (Converted: $${finalUsd} USD)`
      );
    }

    return res.status(200).json({
      received: true,
    });

  } catch (error: any) {
    console.error(
      '[BALANCE WEBHOOK ERROR]',
      error
    );

    return res.status(500).json({
      error: error.message,
    });
  }
};