import prisma from '../lib/prisma';
import { TxStatus, TxType } from '@prisma/client';

export async function createTransaction(data: {
  userId: string;
  ruleId?: string;
  type: TxType;
  currency: string;
  amount: number;
  usdcAmount?: number;
  status: TxStatus;
  hitpayPaymentId?: string;
  circleTxId?: string;
}) {
  return await prisma.transaction.create({
    data: {
      userId: data.userId,
      ruleId: data.ruleId,
      type: data.type,
      status: data.status,
      currency: data.currency,
      amount: data.amount,
      usdcAmount: data.usdcAmount ?? null,
      hitpayPaymentId: data.hitpayPaymentId,
      circleTxId: data.circleTxId,
    },
  });
}

export async function updateTransactionStatus(
  transactionId: string,
  status: TxStatus,
  circleTxId?: string,
  usdcAmount?: number
) {
  return await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status,
      circleTxId: circleTxId || undefined,
      usdcAmount: usdcAmount !== undefined ? usdcAmount : undefined,
    },
  });
}

export async function getTransaction(transactionId: string) {
  return await prisma.transaction.findUnique({
    where: { id: transactionId },
  });
}

export async function findPendingRemittance(
  userId: string,
  ruleId: string
) {
  return await prisma.transaction.findFirst({
    where: {
      userId,
      ruleId,
      type: 'REMITTANCE',
      status: {
        in: ['PENDING', 'SUCCESS'] as any,
      },
    },
  });
}