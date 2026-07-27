import { Request, Response } from 'express';
import prisma from '../lib/prisma';

/**
 * Handle HitPay payment webhook events.
 */
export const handleHitPayWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body);

    const event = JSON.parse(rawBody);

    console.log(
      'HitPay webhook received:',
      event
    );

    const paymentId =
      event.payment_request_id ||
      event.id ||
      event.paymentId;

    const eventStatus = event.status;

    if (!paymentId) {
      console.warn(
        'Missing payment identifier in webhook payload'
      );

      return res.status(400).json({
        error: 'Missing payment identifier',
      });
    }

    const payment =
      await prisma.payment.findUnique({
        where: {
          paymentId,
        },
        include: {
          user: {
            include: {
              wallet: true,
            },
          },
        },
      });

    if (!payment) {
      console.warn(
        'Payment not found:',
        paymentId
      );

      return res.status(404).json({
        error: 'Payment not found',
      });
    }

    await prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: eventStatus,
      },
    });

    if (
      eventStatus === 'completed' ||
      eventStatus === 'success'
    ) {
      const transaction =
        await prisma.transaction.findFirst({
          where: {
            hitpayPaymentId: paymentId,
          },
        });

      if (!transaction) {
        console.warn(
          `Transaction not found for payment ${paymentId}`
        );

        return res.status(200).json({
          received: true,
        });
      }

      /**
       * Prevent duplicate webhook processing.
       */
      if (transaction.status === 'SUCCESS') {
        console.log(
          `Payment ${paymentId} already processed`
        );

        return res.status(200).json({
          received: true,
          message: 'Already processed',
        });
      }

      const targetAmount = payment.amount;
      const targetCurrency = payment.currency;

      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: {
            id: transaction.id,
          },
          data: {
            status: 'SUCCESS',
            usdcAmount: null,
          },
        });
      });

      console.log(
        `HitPay payment recorded: ${targetAmount} ${targetCurrency}`
      );
    }

    return res.status(200).json({
      received: true,
    });

  } catch (error: any) {
    console.error(
      'HitPay webhook processing error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Internal server error',
    });
  }
};

/**
 * Check HitPay payment status.
 */
export const checkPaymentStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const paymentId = String(
      req.params.paymentId
    );

    if (!paymentId || !paymentId.trim()) {
      return res.status(400).json({
        error: 'Invalid paymentId',
      });
    }

    const payment =
      await prisma.payment.findUnique({
        where: {
          paymentId,
        },
        include: {
          user: true,
        },
      });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: payment,
    });

  } catch (error: any) {
    console.error(
      'Check payment status error:',
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        'Internal server error',
    });
  }
};