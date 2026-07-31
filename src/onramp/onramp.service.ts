import prisma from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

// ============================================================
// 📦 TYPES & ENUMS
// ============================================================

export enum OnRampStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum OnRampStep {
  USER_REQUESTED = 'USER_REQUESTED',        // User request on-ramp
  USD_DEDUCTED = 'USD_DEDUCTED',            // USD balance deducted
  MOCK_DEPOSIT_INITIATED = 'MOCK_DEPOSIT_INITIATED', // Circle Mint mock deposit created
  MOCK_DEPOSIT_SETTLED = 'MOCK_DEPOSIT_SETTLED',     // Mock deposit settled (USDC minted)
  TRANSFER_TO_TREASURY = 'TRANSFER_TO_TREASURY',     // Transfer to treasury initiated
  TRANSFER_TO_TREASURY_COMPLETE = 'TRANSFER_TO_TREASURY_COMPLETE', // Transfer complete
  USER_CREDITED = 'USER_CREDITED',          // User wallet updated
  COMPLETED = 'COMPLETED',                  // All done
}

// ============================================================
// 📦 INTERFACE (diperbaiki agar kompatibel dengan Prisma)
// ============================================================

export interface OnRampRecord {
  id: string;
  userId: string;
  amount: number;              // USD amount
  currency: string;            // "USD"
  fiatAmount?: number | null;  // nullable
  fiatCurrency?: string | null; // nullable

  status: OnRampStatus | string;  // bisa enum atau string dari DB
  step: OnRampStep | string | null; // bisa enum, string, atau null

  trackingRef?: string | null;
  transferId?: string | null;
  transactionHash?: string | null;
  errorMessage?: string | null;

  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
}

// ============================================================
// 🔧 CREATE ON-RAMP RECORD
// ============================================================

export async function createOnRampRecord(params: {
  userId: string;
  amount: number;
  currency?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
}): Promise<OnRampRecord> {
  const {
    userId,
    amount,
    currency = 'USD',
    fiatAmount,
    fiatCurrency,
  } = params;

  // Check if user already has pending on-ramp (optional)
  const existing = await prisma.onRampTransaction.findFirst({
    where: {
      userId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
  });

  if (existing) {
    throw new Error('User already has a pending on-ramp transaction');
  }

  const record = await prisma.onRampTransaction.create({
    data: {
      userId,
      amount,
      currency,
      fiatAmount: fiatAmount || amount,
      fiatCurrency: fiatCurrency || 'USD',
      status: 'PENDING',
      step: 'USER_REQUESTED',
    },
  });

  return record;
}

// ============================================================
// 🔄 UPDATE ON-RAMP STATUS
// ============================================================

export async function updateOnRampStep(
  id: string,
  step: OnRampStep,
  status: OnRampStatus = OnRampStatus.PROCESSING,
  metadata?: {
    trackingRef?: string;
    transferId?: string;
    transactionHash?: string;
    errorMessage?: string;
  }
): Promise<OnRampRecord> {
  const data: any = {
    step,
    status,
    updatedAt: new Date(),
  };

  if (status === OnRampStatus.COMPLETED) {
    data.completedAt = new Date();
  }

  if (metadata) {
    if (metadata.trackingRef) data.trackingRef = metadata.trackingRef;
    if (metadata.transferId) data.transferId = metadata.transferId;
    if (metadata.transactionHash) data.transactionHash = metadata.transactionHash;
    if (metadata.errorMessage) data.errorMessage = metadata.errorMessage;
  }

  const record = await prisma.onRampTransaction.update({
    where: { id },
    data,
  });

  return record;
}

// ============================================================
// 🔍 FIND ON-RAMP RECORD
// ============================================================

export async function findOnRampById(id: string): Promise<OnRampRecord | null> {
  const record = await prisma.onRampTransaction.findUnique({
    where: { id },
  });
  return record as OnRampRecord | null;
}

export async function findOnRampByTrackingRef(trackingRef: string): Promise<OnRampRecord | null> {
  const record = await prisma.onRampTransaction.findFirst({
    where: { trackingRef },
  });
  return record as OnRampRecord | null;
}

export async function findOnRampByTransferId(transferId: string): Promise<OnRampRecord | null> {
  const record = await prisma.onRampTransaction.findFirst({
    where: { transferId },
  });
  return record as OnRampRecord | null;
}

export async function findOnRampByUserId(userId: string, status?: OnRampStatus): Promise<OnRampRecord[]> {
  const records = await prisma.onRampTransaction.findMany({
    where: {
      userId,
      ...(status && { status }),
    },
    orderBy: { createdAt: 'desc' },
  });
  return records as OnRampRecord[];
}

// ============================================================
// 🧪 CHECK & UPDATE FROM EXTERNAL EVENTS
// ============================================================

/**
 * Dipanggil saat Circle Mint mock deposit settled
 */
export async function handleDepositSettled(trackingRef: string, amount: number): Promise<OnRampRecord | null> {
  const record = await findOnRampByTrackingRef(trackingRef);
  if (!record) {
    console.warn(`⚠️ No on-ramp record found for trackingRef: ${trackingRef}`);
    return null;
  }

  if (record.status === OnRampStatus.COMPLETED || record.step === OnRampStep.MOCK_DEPOSIT_SETTLED) {
    console.log(`⏭️ On-ramp ${record.id} already processed`);
    return record;
  }

  return updateOnRampStep(
    record.id,
    OnRampStep.MOCK_DEPOSIT_SETTLED,
    OnRampStatus.PROCESSING,
    { trackingRef }
  );
}

/**
 * Dipanggil saat transfer ke treasury complete
 */
export async function handleTransferToTreasuryComplete(
  transferId: string,
  transactionHash: string,
  amount: number
): Promise<OnRampRecord | null> {
  const record = await findOnRampByTransferId(transferId);
  if (!record) {
    console.warn(`⚠️ No on-ramp record found for transferId: ${transferId}`);
    return null;
  }

  if (record.status === OnRampStatus.COMPLETED) {
    return record;
  }

  return updateOnRampStep(
    record.id,
    OnRampStep.TRANSFER_TO_TREASURY_COMPLETE,
    OnRampStatus.PROCESSING,
    { transferId, transactionHash }
  );
}

/**
 * Dipanggil saat user wallet successfully credited
 */
export async function handleUserCredited(onRampId: string): Promise<OnRampRecord> {
  return updateOnRampStep(
    onRampId,
    OnRampStep.USER_CREDITED,
    OnRampStatus.COMPLETED
  );
}

/**
 * Mark on-ramp as failed
 */
export async function markOnRampFailed(id: string, errorMessage: string): Promise<OnRampRecord> {
  return updateOnRampStep(
    id,
    OnRampStep.USER_REQUESTED,
    OnRampStatus.FAILED,
    { errorMessage }
  );
}

// ============================================================
// 📊 GET USER ON-RAMP STATUS (for frontend)
// ============================================================

export async function getUserOnRampSummary(userId: string): Promise<{
  pending: OnRampRecord[];
  processing: OnRampRecord[];
  completed: OnRampRecord[];
  failed: OnRampRecord[];
}> {
  const all = await findOnRampByUserId(userId);

  return {
    pending: all.filter(r => r.status === OnRampStatus.PENDING),
    processing: all.filter(r => r.status === OnRampStatus.PROCESSING),
    completed: all.filter(r => r.status === OnRampStatus.COMPLETED),
    failed: all.filter(r => r.status === OnRampStatus.FAILED),
  };
}

/**
 * Get on-ramp status by ID (for frontend polling)
 */
export async function getOnRampStatus(id: string): Promise<{
  status: OnRampStatus;
  step: OnRampStep;
  amount: number;
  currency: string;
  trackingRef?: string;
  transactionHash?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}> {
  const record = await findOnRampById(id);
  if (!record) {
    throw new Error(`On-ramp record ${id} not found`);
  }

  return {
    status: record.status as OnRampStatus, // asumsi status selalu valid enum
    step: record.step as OnRampStep,
    amount: record.amount,
    currency: record.currency,
    trackingRef: record.trackingRef || undefined,
    transactionHash: record.transactionHash || undefined,
    errorMessage: record.errorMessage || undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || undefined,
  };
}

// ============================================================
// 🧹 UTILITY
// ============================================================

export async function cleanupExpiredPending(): Promise<number> {
  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() - 1); // 1 hour expiry

  const result = await prisma.onRampTransaction.updateMany({
    where: {
      status: OnRampStatus.PENDING,
      createdAt: { lt: expiryDate },
    },
    data: {
      status: OnRampStatus.EXPIRED,
      step: OnRampStep.USER_REQUESTED,
      errorMessage: 'Transaction expired',
    },
  });

  return result.count;
}

export default {
  createOnRampRecord,
  updateOnRampStep,
  findOnRampById,
  findOnRampByTrackingRef,
  findOnRampByTransferId,
  findOnRampByUserId,
  handleDepositSettled,
  handleTransferToTreasuryComplete,
  handleUserCredited,
  markOnRampFailed,
  getUserOnRampSummary,
  getOnRampStatus,
  cleanupExpiredPending,
};