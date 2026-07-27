import { Request, Response } from 'express';
import { createHitPayPaymentRequest } from '../services/hitpayService';
import prisma from '../lib/prisma';

export const requestDeposit = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User ID not found',
      });
    }

    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'Amount and currency are required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const numericAmount = parseFloat(amount);
    const reference = `DEPOSIT-${userId}-${Date.now()}`;

    const hitpayPayment = await createHitPayPaymentRequest({
      amount: numericAmount,
      currency: currency.toUpperCase(),
      reference,
      customerEmail: user.email,
      customerName: user.fullName || 'SakuLink User',
    });

    await prisma.payment.create({
      data: {
        userId,
        provider: 'HITPAY',
        paymentId: hitpayPayment.id,
        referenceNumber: reference,
        currency: currency.toUpperCase(),
        amount: numericAmount,
        status: 'pending',
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
        currency: currency.toUpperCase(),
        amount: numericAmount,
        hitpayPaymentId: hitpayPayment.id,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        paymentUrl: hitpayPayment.url,
        paymentId: hitpayPayment.id,
        reference,
        amount: numericAmount,
        currency: currency.toUpperCase(),
        status: 'PENDING',
      },
    });

  } catch (error: any) {
    console.error('Create deposit error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};


export const getDepositHistory = async (
  req: Request,
  res: Response
): Promise<any> => {

  try {
    const userId = (req as any).user?.id || (req as any).userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const deposits = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: deposits,
    });

  } catch (error: any) {
    console.error('Get deposit history error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};