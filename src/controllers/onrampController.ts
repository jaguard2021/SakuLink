import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { createTransFiOnrampOrder, createTransFiUser } from '../services/transfiService';
import {
  createWireBankAccount,
  getWireInstructions,
  mockWireDeposit,
  transferToVerifiedRecipient,
  getTransferStatus,
} from '../services/circleMintService';
import prisma from '../lib/prisma';

// ============================================================
// 📦 Interface untuk Request dengan User ID
// ============================================================
interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

// ============================================================
// 🔧 Konfigurasi Treasury
// ============================================================
const TREASURY_RECIPIENT_ID =
  process.env.CIRCLE_TREASURY_RECIPIENT_ID ||
  'cfc8fc48-2975-5e4c-8e35-d99edc35e7f0';

const CIRCLE_MINT_API_KEY = process.env.CIRCLE_MINT_API_KEY || '';

// ============================================================
// 🔐 Inisialisasi Circle Developer-Controlled Wallets Client
// ============================================================
const circleDevClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// ============================================================
// 🔍 Helper: Cek Status Deposit dari Circle API
// ============================================================
async function checkDepositStatusFromCircle(trackingRef: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://api-sandbox.circle.com/v1/businessAccount/deposits?trackingRef=${trackingRef}`,
      {
        headers: {
          Authorization: `Bearer ${CIRCLE_MINT_API_KEY}`,
        },
      }
    );

    const deposits = response.data?.data || [];
    if (deposits.length === 0) {
      return 'not_found';
    }

    const latest = deposits[0];
    return latest.status; // 'pending' | 'processed' | 'complete' | 'failed'
  } catch (error: any) {
    console.error('❌ Error checking deposit status from Circle:', error.message);
    return 'error';
  }
}

// ============================================================
// 🧠 BACKGROUND JOB: Proses Onramp di Belakang Layar (LENGKAP)
// ============================================================
async function processOnrampBackground(params: {
  transactionId: string;
  userId: string;
  trackingRef: string;
  amount: number;
  beneficiaryAccountNumber: string;
}) {
  const { transactionId, userId, trackingRef, amount, beneficiaryAccountNumber } = params;

  console.log(`🧠 Background job started for transaction ${transactionId}`);

  try {
    // 1️⃣ Polling deposit sampai settle (max 30 menit)
    console.log('⏳ Polling deposit status from Circle API...');
    let depositSettled = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!depositSettled && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 30000));
      const status = await checkDepositStatusFromCircle(trackingRef);
      console.log(`📊 Deposit status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (status === 'complete' || status === 'processed') {
        depositSettled = true;
        console.log('✅ Deposit settled!');
        break;
      } else if (status === 'failed' || status === 'error') {
        console.error(`❌ Deposit failed with status: ${status}`);
        throw new Error(`Deposit failed: ${status}`);
      }
      attempts++;
    }

    if (!depositSettled) {
      throw new Error('Deposit timeout after 30 minutes');
    }

    // ============================================================
    // 2️⃣ Transfer USDC dari Master Wallet ke Treasury (Circle Mint API)
    // ============================================================
    console.log('🔄 Transferring USDC to Treasury...');
    const transfer = await transferToVerifiedRecipient({
      idempotencyKey: uuidv4(),
      addressId: TREASURY_RECIPIENT_ID,
      amount: amount.toString(),
    });
    console.log(`✅ Transfer initiated: ${transfer.id}, status: ${transfer.status}`);

    // Tunggu transfer pertama complete
    let transferComplete = false;
    let transferAttempts = 0;
    let txHash1: string | null = null;
    while (!transferComplete && transferAttempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const status = await getTransferStatus(transfer.id);
      if (status.status === 'complete') {
        transferComplete = true;
        txHash1 = status.transactionHash || null;
        console.log(`✅ Transfer to Treasury completed! TX Hash: ${txHash1}`);
        break;
      }
      transferAttempts++;
    }

    if (!transferComplete) {
      throw new Error('Transfer to Treasury timeout');
    }

    // ============================================================
    // 3️⃣ DISTRIBUSI: Transfer USDC dari Treasury ke Wallet User (ON-CHAIN)
    //    Menggunakan Circle Developer-Controlled Wallets API
    // ============================================================
    console.log(`🚀 Mendistribusikan ${amount} USDC dari Treasury ke wallet user...`);

    // Ambil data wallet user dari database (model Wallet)
    const userWallet = await prisma.wallet.findUnique({
      where: { userId },
      select: {
        address: true,
        circleWalletId: true,
      },
    });

    if (!userWallet?.address) {
      throw new Error('Alamat wallet user (address) tidak ditemukan di database.');
    }
    if (!userWallet?.circleWalletId) {
      throw new Error('Circle Wallet ID user tidak ditemukan. Pastikan user registrasi wallet.');
    }

    // Konfigurasi Arc Testnet
    const BLOCKCHAIN = 'ARC-TESTNET';
    const USDC_CONTRACT_ADDRESS = '0x3600000000000000000000000000000000000000';

    // Kirim transfer via Circle Dev Wallet API
    const transferToUser = await circleDevClient.createTransaction({
      blockchain: BLOCKCHAIN,
      walletAddress: process.env.CIRCLE_TREASURY_ADDRESS!,
      tokenAddress: USDC_CONTRACT_ADDRESS,
      destinationAddress: userWallet.address,
      amount: [amount.toString()],
      fee: {
        type: 'level',
        config: { feeLevel: 'MEDIUM' },
      },
    });

    const userTxId = transferToUser.data?.id;
    let userTxState = transferToUser.data?.state ?? '';

    if (!userTxId) {
      throw new Error('Transfer ke user gagal: tidak ada transaction ID.');
    }

    console.log(`✅ Transfer ke user initiated: ${userTxId}, state: ${userTxState}`);

    // Polling transfer ke user sampai complete, dan ambil txHash
    const terminalStates = new Set(['COMPLETE', 'FAILED', 'CANCELLED', 'DENIED']);
    let userAttempts = 0;
    const maxUserAttempts = 30;
    let userTxHash: string | null = null;

    while (!terminalStates.has(userTxState) && userAttempts < maxUserAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const pollRes = await circleDevClient.getTransaction({ id: userTxId });
      const tx = pollRes.data?.transaction;
      userTxState = tx?.state ?? '';
      // Coba ambil transaction hash dari response polling (field mungkin berbeda)
      if (tx) {
        const txAny = tx as any;
        userTxHash = txAny.transactionHash || txAny.txHash || txAny.hash || null;
      }
      console.log(
        `📊 Transfer ke user status: ${userTxState} (attempt ${userAttempts + 1}/${maxUserAttempts})`
      );
      userAttempts++;
    }

    if (userTxState !== 'COMPLETE') {
      throw new Error(`Transfer ke user ended in state: ${userTxState}`);
    }

    // Fallback: jika hash belum dapat, ambil dari response awal (jika ada)
    if (!userTxHash) {
      const dataAny = transferToUser.data as any;
      userTxHash = dataAny.transactionHash || dataAny.txHash || dataAny.hash || null;
    }

    console.log(`✅ Transfer ke user COMPLETE! TX hash: ${userTxHash}`);

    // (Opsional) Cek balance on-chain user setelah transfer
    try {
      const balanceRes = await circleDevClient.getWalletTokenBalance({
        id: userWallet.circleWalletId,
      });
      console.log(
        `💰 User wallet on-chain balance: ${
          balanceRes.data?.tokenBalances?.[0]?.amount || 0
        } USDC`
      );
    } catch (e) {
      console.warn('⚠️ Gagal cek balance user, tapi transfer sudah sukses.');
    }

    // ============================================================
    // 4️⃣ Update saldo internal (database) & transaksi
    // ============================================================
    await prisma.wallet.update({
      where: { userId },
      data: { balance: { increment: amount } },
    });
    console.log(`💰 User wallet balance increased by ${amount} USDC (internal ledger)`);

    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'SUCCESS',
        circleTxId: transfer.id,
        userTxHash: userTxHash,
        usdcAmount: amount,
      },
    });
    console.log(`✅ Transaction ${transactionId} updated to SUCCESS`);

    console.log(
      `🎉 Onramp completed for user ${userId}: ${amount} USDC distributed ON-CHAIN!`
    );
  } catch (error: any) {
    console.error(
      `❌ Background job failed for transaction ${transactionId}:`,
      error.message
    );

    // Rollback saldo USD jika gagal
    try {
      await prisma.fiatAccount.update({
        where: { userId },
        data: { usdBalance: { increment: amount } },
      });
      console.log(`🔄 USD balance rolled back by ${amount}`);

      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED' },
      });
      console.log(`❌ Transaction ${transactionId} marked as FAILED`);
    } catch (rollbackError) {
      console.error('❌ Rollback failed:', rollbackError);
    }
  }
}

// ============================================================
// 🚀 ONRAMP VIA TRANSFI (TIDAK BERUBAH)
// ============================================================
export async function initiateOnramp(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than zero',
      });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    let transFiUserId = dbUser.transfiUserId;

    if (!transFiUserId) {
      try {
        const transfiUser = await createTransFiUser({
          email: dbUser.email,
          firstName: dbUser.fullName?.split(' ')[0] || 'User',
          lastName: dbUser.fullName?.split(' ').slice(1).join(' ') || 'SakuLink',
          phone: dbUser.phone ?? undefined,
          phoneCode: dbUser.phoneCode ?? undefined,
          country: dbUser.country ?? undefined,
          countryOfResidence: dbUser.country ?? undefined,
          gender: dbUser.gender ?? undefined,
          address: {
            street: dbUser.street ?? undefined,
            city: dbUser.city ?? undefined,
            state: dbUser.state ?? undefined,
            postalCode: dbUser.postalCode ?? undefined,
          },
        });

        transFiUserId = transfiUser.data?.userId || transfiUser.userId;
        if (!transFiUserId) {
          throw new Error('TransFi user ID was not returned');
        }

        await prisma.user.update({
          where: { id: dbUser.id },
          data: { transfiUserId: transFiUserId },
        });

        console.log(`✅ User ${dbUser.email} registered to TransFi: ${transFiUserId}`);
      } catch (error: any) {
        console.error('❌ Failed to register TransFi user:', error.response?.data || error.message);
        return res.status(500).json({
          success: false,
          error: 'Failed to register TransFi user',
          details: error.response?.data || error.message,
        });
      }
    }

    if (!transFiUserId) {
      return res.status(500).json({
        success: false,
        error: 'Missing TransFi user ID',
      });
    }

    const result = await createTransFiOnrampOrder({
      userId: transFiUserId,
      amount,
      walletAddress: process.env.CIRCLE_TREASURY_ADDRESS!,
      successRedirectUrl: 'http://localhost:3000/success',
      failureRedirectUrl: 'http://localhost:3000/failure',
    });

    const order = await prisma.transfiOrder.create({
      data: {
        userId: dbUser.id,
        orderType: 'ONRAMP',
        provider: 'TRANSFI',
        providerOrderId: result.data.orderId,
        providerTraceId: result.traceId || null,
        amount,
        currency: 'USD',
        paymentType: 'bank_transfer',
        paymentCode: 'wire',
        crypto: 'USDCBASE',
        cryptoNetwork: 'Base',
        cryptoAmount: result.feeData?.withdrawAmount || 0,
        walletAddress: process.env.CIRCLE_TREASURY_ADDRESS!,
        walletOwner: 'exchange',
        successRedirectUrl: 'http://localhost:3000/success',
        failureRedirectUrl: 'http://localhost:3000/failure',
        payUrl: result.data.payUrl,
        payToken: result.data.payUrl?.split('paytoken=')[1] || null,
        status: 'PAYMENT_PENDING',
        fee: result.feeData?.totalFee || 0,
        rawResponse: result as any,
      },
    });

    return res.status(200).json({
      success: true,
      orderId: result.data.orderId,
      paymentUrl: result.data.payUrl,
      transactionId: order.id,
      fee: result.feeData?.totalFee || 0,
      cryptoAmount: result.feeData?.withdrawAmount || 0,
    });
  } catch (error: any) {
    console.error('❌ Onramp error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process onramp',
    });
  }
}

// ============================================================
// 🚀 ONRAMP VIA CIRCLE MINT (DENGAN BACKGROUND JOB)
// ============================================================
export async function initiateCircleOnramp(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be > 0' });
    }

    // 1️⃣ Cek saldo USD user
    const fiatAccount = await prisma.fiatAccount.findUnique({
      where: { userId },
    });
    if (!fiatAccount || fiatAccount.usdBalance < amount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient USD balance. Available: $${fiatAccount?.usdBalance || 0}`,
      });
    }

    // 2️⃣ Buat bank account baru untuk trackingRef unik
    console.log('🏦 Creating new bank account for onramp...');
    const bankAccount = await createWireBankAccount({
      idempotencyKey: uuidv4(),
      accountNumber: '12340010',
      routingNumber: '121000248',
      billingDetails: {
        name: 'SakuLink Onramp',
        city: 'Boston',
        country: 'US',
        line1: '100 Money Street',
        postalCode: '01234',
        district: 'MA',
      },
      bankAddress: {
        bankName: 'WELLS FARGO BANK, NA',
        city: 'San Francisco',
        country: 'US',
        line1: '420 Montgomery Street',
        district: 'CA',
      },
    });

    // 3️⃣ Ambil instruksi wire
    const instructions = await getWireInstructions(bankAccount.id);
    const trackingRef = instructions.trackingRef;
    const beneficiaryAccountNumber = instructions.beneficiaryBank.accountNumber;

    console.log(`✅ Bank account created with trackingRef: ${trackingRef}`);

    // 4️⃣ Kurangi saldo USD
    await prisma.fiatAccount.update({
      where: { userId },
      data: { usdBalance: { decrement: amount } },
    });
    console.log(`💰 USD balance decreased by ${amount}`);

    // 5️⃣ Catat transaksi
    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        status: 'PENDING',
        currency: 'USD',
        amount: amount,
        usdcAmount: amount,
        provider: 'CIRCLE_ONRAMP',
        providerOrderId: trackingRef,
      },
    });
    console.log(`📝 Transaction created: ${transaction.id}`);

    // 6️⃣ Initiate mock deposit
    const deposit = await mockWireDeposit({
      idempotencyKey: uuidv4(),
      amount: amount.toString(),
      trackingRef,
      beneficiaryAccountNumber,
    });
    console.log(`✅ Circle Mint deposit initiated, status: ${deposit.status}`);

    // 7️⃣ 🔥 Jalankan background job (tanpa await)
    processOnrampBackground({
      transactionId: transaction.id,
      userId,
      trackingRef,
      amount,
      beneficiaryAccountNumber,
    }).catch((error) => {
      console.error(
        `❌ Unhandled error in background job for transaction ${transaction.id}:`,
        error
      );
    });

    // 8️⃣ Response langsung ke client
    res.status(200).json({
      success: true,
      message: 'Onramp initiated. USDC will be credited shortly. Please check status later.',
      transactionId: transaction.id,
      trackingRef,
    });
  } catch (error: any) {
    console.error('❌ Circle onramp error:', error.message);

    // Rollback saldo jika gagal di awal
    if (req.body?.amount && req.userId) {
      try {
        await prisma.fiatAccount.update({
          where: { userId: req.userId },
          data: { usdBalance: { increment: req.body.amount } },
        });
        console.log(`🔄 USD balance rolled back by ${req.body.amount}`);
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate Circle onramp',
    });
  }
}

// ============================================================
// 🔍 GET ON-RAMP STATUS
// ============================================================
export async function getOnrampStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const latest = await prisma.transaction.findFirst({
      where: {
        userId,
        provider: 'CIRCLE_ONRAMP',
        type: 'DEPOSIT',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        amount: true,
        usdcAmount: true,
        providerOrderId: true,
        circleTxId: true,
        userTxHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!latest) {
      return res.status(200).json({
        success: true,
        data: {
          hasOnramp: false,
          message: 'No on-ramp transactions found',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        hasOnramp: true,
        ...latest,
        statusText:
          latest.status === 'SUCCESS'
            ? '✅ Transaksi berhasil'
            : latest.status === 'PENDING'
            ? '⏳ Proses sedang berjalan...'
            : latest.status === 'FAILED'
            ? '❌ Transaksi gagal'
            : latest.status,
      },
    });
  } catch (error: any) {
    console.error('❌ Get onramp status error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ============================================================
// 📋 GET ON-RAMP TRANSACTIONS
// ============================================================
export async function getOnrampTransactions(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        provider: 'CIRCLE_ONRAMP',
        type: 'DEPOSIT',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        amount: true,
        usdcAmount: true,
        providerOrderId: true,
        circleTxId: true,
        userTxHash: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error: any) {
    console.error('❌ Get onramp transactions error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}