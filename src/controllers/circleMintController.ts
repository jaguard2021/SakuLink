// src/controllers/circleMintController.ts
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createWireBankAccount,
  getWireInstructions,
  mockWireDeposit,
  getMintBalance,
  getMasterWalletId,
  transferToVerifiedRecipient,
  getTransferStatus,
  createRecipientAddress,
  fullMockDepositAndTransfer,
} from '../services/circleMintService';
import prisma from '../lib/prisma';

interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

function successResponse(res: Response, data: any, status: number = 200) {
  return res.status(status).json({ success: true, data });
}

function errorResponse(res: Response, error: any, status: number = 500) {
  console.error('❌ Circle Mint error:', error.message || error);
  return res.status(status).json({
    success: false,
    error: error.message || 'Internal server error',
  });
}

// ============================================================
// 🏦 1. Daftarkan Bank Account (Wire)
// ============================================================

export async function registerBankAccount(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const idempotencyKey = uuidv4();

    // 🔥 Default values dengan district
    const {
      accountNumber = '12340010',
      routingNumber = '121000248',
      billingDetails = {
        name: 'SakuLink Treasury',
        city: 'Boston',
        country: 'US',
        line1: '100 Money Street',
        postalCode: '01234',
        district: 'MA',
      },
      bankAddress = {
        bankName: 'WELLS FARGO BANK, NA',
        city: 'San Francisco',
        country: 'US',
        line1: '420 Montgomery Street',
        district: 'CA',
      },
    } = req.body;

    const account = await createWireBankAccount({
      idempotencyKey,
      accountNumber,
      routingNumber,
      billingDetails,
      bankAddress,
    });

    console.log(`✅ Bank account registered: ${account.id} (trackingRef: ${account.trackingRef})`);
    return successResponse(res, account);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 📄 2. Dapatkan Instruksi Wire
// ============================================================

export async function getBankInstructions(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const bankAccountId = req.params.bankAccountId as string;
    if (!bankAccountId) {
      return res.status(400).json({ success: false, error: 'bankAccountId is required' });
    }

    const instructions = await getWireInstructions(bankAccountId);
    console.log(`✅ Wire instructions fetched for bank: ${bankAccountId}`);
    return successResponse(res, instructions);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 💰 3. Mock Wire Deposit (Sandbox – Mints USDC)
// ============================================================

export async function mockDeposit(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { amount, trackingRef, beneficiaryAccountNumber } = req.body;

    if (!amount || !trackingRef || !beneficiaryAccountNumber) {
      return res.status(400).json({
        success: false,
        error: 'amount, trackingRef, and beneficiaryAccountNumber are required',
      });
    }

    const idempotencyKey = uuidv4();

    const result = await mockWireDeposit({
      amount,
      trackingRef,
      beneficiaryAccountNumber,
      idempotencyKey,
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
        currency: 'USD',
        amount: parseFloat(amount),
        usdcAmount: parseFloat(amount),
        provider: 'CIRCLE_MINT',
        providerOrderId: trackingRef,
        circleTxId: null,
      },
    });

    console.log(`✅ Mock deposit initiated: ${trackingRef} (${amount} USD)`);
    return successResponse(res, result);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 💰 4. Cek Saldo Circle Mint
// ============================================================

export async function getBalance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const [balance, masterWalletId] = await Promise.all([
      getMintBalance(),
      getMasterWalletId(),
    ]);

    console.log(`✅ Balance fetched: ${balance.available[0]?.amount || 0} USD`);
    return successResponse(res, {
      available: balance.available,
      unsettled: balance.unsettled,
      masterWalletId,
    });
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 📬 5. Daftarkan Recipient Address
// ============================================================

export async function registerRecipientAddress(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { address, chain, description } = req.body;

    if (!address || !chain) {
      return res.status(400).json({
        success: false,
        error: 'address and chain are required',
      });
    }

    const idempotencyKey = uuidv4();

    const recipient = await createRecipientAddress({
      address,
      chain,
      description: description || 'SakuLink recipient',
      idempotencyKey,
    });

    console.log(`✅ Recipient address registered: ${recipient.id} (${address})`);
    console.log(`💡 Simpan ke .env: CIRCLE_RECIPIENT_ADDRESS_ID=${recipient.id}`);

    return successResponse(res, recipient);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 💰 6. Transfer USDC ke Recipient Address (Verified)
// ============================================================

export async function transferToRecipient(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { addressId, amount } = req.body;

    if (!addressId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'addressId and amount are required',
      });
    }

    const idempotencyKey = uuidv4();

    const transfer = await transferToVerifiedRecipient({
      addressId,
      amount,
      idempotencyKey,
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
        currency: 'USDC',
        amount: parseFloat(amount),
        usdcAmount: parseFloat(amount),
        provider: 'CIRCLE_MINT',
        providerOrderId: transfer.id,
        circleTxId: transfer.transactionHash || null,
      },
    });

    console.log(`✅ Transfer initiated: ${transfer.id} (${amount} USDC)`);
    return successResponse(res, transfer);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 🔍 7. Cek Status Transfer
// ============================================================

export async function getTransferStatusHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const transferId = req.params.transferId as string;
    if (!transferId) {
      return res.status(400).json({ success: false, error: 'transferId is required' });
    }

    const transfer = await getTransferStatus(transferId);
    console.log(`✅ Transfer status: ${transfer.id} → ${transfer.status}`);
    return successResponse(res, transfer);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 🧪 8. Full Flow Test (Sandbox)
// ============================================================

export async function fullFlowTest(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { amount, destinationAddress, chain } = req.body;

    if (!amount) {
      return res.status(400).json({ success: false, error: 'amount is required' });
    }

    const result = await fullMockDepositAndTransfer(
      amount,
      destinationAddress,
      chain || 'ARC'
    );

    console.log(`✅ Full flow test completed for user ${userId}`);
    return successResponse(res, result);
  } catch (error: any) {
    return errorResponse(res, error);
  }
}

// ============================================================
// 📌 9. Get Master Wallet ID
// ============================================================

export async function getMasterWalletIdHandler(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const masterWalletId = await getMasterWalletId();
    console.log(`✅ Master Wallet ID: ${masterWalletId}`);
    return successResponse(res, { masterWalletId });
  } catch (error: any) {
    return errorResponse(res, error);
  }
}