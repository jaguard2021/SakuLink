import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { TransactionStatus } from '@prisma/client';

const WEBHOOK_SECRET =
  process.env.TRANSFI_WEBHOOK_SECRET || 's5nRqUWSFMe6UD';

/**
 * Parse webhook body from raw Buffer or JSON object.
 */
function parseRawBody(body: unknown): any {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return null;
    }
  }

  if (typeof body === 'object' && body !== null) {
    return body;
  }

  return null;
}

/**
 * Map TransFi order status to internal transaction status.
 */
function mapTransFiStatus(status: string): TransactionStatus {
  const statusMap: Record<string, TransactionStatus> = {
    initiated: TransactionStatus.PENDING,
    fund_processing: TransactionStatus.PAYMENT_PENDING,
    fund_deposited: TransactionStatus.PAID,
    asset_processing: TransactionStatus.CRYPTO_SENT,
    asset_settled: TransactionStatus.COMPLETED,
    completed: TransactionStatus.COMPLETED,
    failed: TransactionStatus.FAILED,
    expired: TransactionStatus.EXPIRED,
  };

  return statusMap[status] || TransactionStatus.PENDING;
}

/**
 * Handle TransFi onramp webhook events.
 */
export async function handleTransFiWebhook(
  req: Request,
  res: Response
) {
  try {
    const payload = parseRawBody(req.body);

    if (!payload) {
      console.warn('Invalid webhook payload');
      return res.status(400).json({
        error: 'Invalid payload',
      });
    }

    const signature = req.headers['x-signature'] as string;

    console.log(
      'TransFi webhook received:',
      JSON.stringify(payload, null, 2)
    );

    // Verify webhook signature when provided.
    if (signature) {
      const hmac = crypto.createHmac(
        'sha256',
        WEBHOOK_SECRET
      );

      const digest = hmac
        .update(JSON.stringify(payload))
        .digest('hex');

      if (digest !== signature) {
        console.warn('Invalid webhook signature');
        return res.status(401).json({
          error: 'Invalid signature',
        });
      }
    }

    const status = payload.status;

    let orderId =
      payload.orderId ||
      payload.entityId ||
      payload.entity?.orderId ||
      payload.data?.orderId;

    if (
      payload.entity &&
      payload.entityType === 'order'
    ) {
      orderId =
        payload.entity.orderId ||
        payload.entityId;
    }

    if (!orderId) {
      orderId =
        payload.order?.orderId ||
        payload.data?.orderId;
    }

    if (!orderId) {
      console.warn(
        'Webhook received without order ID'
      );

      return res.status(200).json({
        received: true,
        message: 'No orderId found',
      });
    }

    console.log(
      `Processing TransFi order ${orderId} with status ${status}`
    );

    const updatedOrder =
      await prisma.transfiOrder.update({
        where: {
          providerOrderId: orderId,
        },
        data: {
          status: mapTransFiStatus(status),
          updatedAt: new Date(),
        },
      });

    console.log(
      `Order ${orderId} updated to ${updatedOrder.status}`
    );

    /**
     * Asset settled means USDC delivery has completed.
     * Wallet accounting can be added here when Circle balance
     * synchronization is enabled.
     */
    if (
      status === 'asset_settled' ||
      status === 'completed'
    ) {
      console.log(
        `Order ${orderId} completed. USDC settlement confirmed.`
      );
    }

    return res.sendStatus(200);

  } catch (error: any) {
    console.error(
      'TransFi webhook error:',
      error.message
    );

    return res.status(500).json({
      error: error.message,
    });
  }
}