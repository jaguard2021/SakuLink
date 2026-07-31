import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { creditUserWallet } from '../services/walletService'; // ✅ Import from service

// ============================================================
// 🔧 Konfigurasi
// ============================================================
const MOONPAY_WEBHOOK_KEY = process.env.MOONPAY_WEBHOOK_KEY || '';
const MOONPAY_TEST_MODE = process.env.MOONPAY_TEST_MODE === 'true';
const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || '0xb19a9290636245a703ee31b35b271ae89a8328ff';

// ============================================================
// 🔐 Verify MoonPay signature (v2)
// ============================================================
function verifyMoonPaySignature(req: Request & { rawBody?: string }, secret: string): boolean {
  try {
    const signatureHeader =
      (req.headers['moonpay-signature-v2'] as string) ||
      (req.headers['moonpay-signature'] as string);

    if (!signatureHeader || !req.rawBody) {
      console.warn('⚠️ Missing signature header or raw body');
      return false;
    }

    const parts = signatureHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const signature = parts.find(p => p.startsWith('s='))?.split('=')[1];

    if (!timestamp || !signature) {
      console.warn('⚠️ Invalid signature format');
      return false;
    }

    const payload = timestamp + '.' + req.rawBody;
    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    const digestBuffer = Buffer.from(digest, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (digestBuffer.length !== signatureBuffer.length) {
      console.warn('⚠️ Signature length mismatch');
      return false;
    }

    return crypto.timingSafeEqual(digestBuffer, signatureBuffer);
  } catch (error) {
    console.warn('⚠️ Signature verification error:', error);
    return false;
  }
}

// ============================================================
// 📨 Webhook Handler
// ============================================================
export async function handleMoonPayWebhook(req: Request & { rawBody?: string }, res: Response) {
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    console.log('📨 MoonPay webhook received:', rawBody);

    // 🔐 Verifikasi signature (skip jika test mode)
    if (!MOONPAY_TEST_MODE && MOONPAY_WEBHOOK_KEY) {
      const isValid = verifyMoonPaySignature(req, MOONPAY_WEBHOOK_KEY);
      if (!isValid) {
        console.warn('⚠️ Invalid MoonPay signature – rejecting');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      console.log('🧪 Test mode active – signature verification skipped');
    }

    // 📦 Parse payload
    const payload = JSON.parse(rawBody);

    // 🔍 Ekstrak data transaksi
    const transaction = payload.data || payload;
    const eventType = payload.type || transaction.type;

    const orderId = transaction.id || payload.id;
    const status = transaction.status || payload.status;
    const txHash = transaction.cryptoTransactionId || transaction.transactionHash || payload.transactionHash;
    const walletAddress = transaction.walletAddress || payload.walletAddress;
    const amount = transaction.quoteCurrencyAmount || payload.quoteCurrencyAmount || 0;
    const baseCurrencyAmount = transaction.baseCurrencyAmount || payload.baseCurrencyAmount || 0;
    const baseCurrency = transaction.baseCurrency || payload.baseCurrency || 'USD';
    const quoteCurrency = transaction.quoteCurrency || payload.quoteCurrency || 'USDC';

    console.log(`📊 Event: ${eventType} | Order: ${orderId} | Status: ${status}`);

    // ============================================================
    // 🔄 Proses berdasarkan event type dan status
    // ============================================================

    // 1️⃣ ORDER CREATED / PENDING
    if (
      eventType === 'transaction_created' ||
      eventType === 'transaction.updated' ||
      status === 'pending' ||
      status === 'waiting'
    ) {
      console.log(`⏳ MoonPay order ${orderId} is pending`);

      await prisma.transaction.updateMany({
        where: { hitpayPaymentId: orderId },
        data: {
          status: 'PENDING',
          amount: baseCurrencyAmount,
          usdcAmount: amount,
        },
      });

      console.log(`✅ Order ${orderId} status updated to PENDING`);
    }

    // 2️⃣ ORDER COMPLETED / SUCCESS
    if (
      status === 'completed' ||
      status === 'success' ||
      eventType === 'transaction.completed' ||
      (eventType === 'transaction_updated' && status === 'completed')
    ) {
      console.log(`✅ MoonPay order ${orderId} completed! TX: ${txHash}`);

      const existingTx = await prisma.transaction.findFirst({
        where: { hitpayPaymentId: orderId },
        include: { user: true },
      });

      if (existingTx) {
        // Update transaksi menjadi SUCCESS
        await prisma.transaction.update({
          where: { id: existingTx.id },
          data: {
            status: 'SUCCESS',
            circleTxId: txHash,
            usdcAmount: amount || existingTx.usdcAmount,
          },
        });

        console.log(`✅ Transaction ${existingTx.id} updated to SUCCESS`);

        // 💰 Credit USDC ke wallet user via service
        if (existingTx.userId) {
          try {
            await creditUserWallet(
              existingTx.userId,
              amount || existingTx.usdcAmount || 0,
              txHash,
              'MOONPAY'
            );
            console.log(`💰 User ${existingTx.userId} credited with ${amount || existingTx.usdcAmount} USDC`);
          } catch (creditError) {
            console.error('❌ Credit wallet failed:', creditError);
            // Jangan throw, tetap lanjutkan karena transaksi sudah sukses
          }
        }

        console.log(`🎉 USDC transferred to: ${walletAddress || TREASURY_WALLET}`);
        console.log(`📊 Amount: ${amount || existingTx.usdcAmount} USDC`);
        console.log(`🔗 TX Hash: ${txHash}`);
      } else {
        console.warn(`⚠️ Transaction not found for MoonPay order ${orderId}`);
        console.warn(`   Please check if order ID matches: ${orderId}`);
      }
    }

    // 3️⃣ ORDER FAILED
    if (
      status === 'failed' ||
      status === 'expired' ||
      status === 'cancelled' ||
      eventType === 'transaction_failed'
    ) {
      console.log(`❌ MoonPay order ${orderId} failed with status: ${status}`);

      await prisma.transaction.updateMany({
        where: { hitpayPaymentId: orderId },
        data: {
          status: 'FAILED',
        },
      });

      console.log(`✅ Order ${orderId} status updated to FAILED`);
    }

    // 4️⃣ UNKNOWN STATUS (log untuk debug)
    if (
      status !== 'pending' &&
      status !== 'waiting' &&
      status !== 'completed' &&
      status !== 'success' &&
      status !== 'failed' &&
      status !== 'expired' &&
      status !== 'cancelled'
    ) {
      console.log(`ℹ️ Unknown status: ${status} for order ${orderId}`);
      console.log(`   Full payload:`, JSON.stringify(payload, null, 2));
    }

    // ✅ Selalu response 200 OK
    res.sendStatus(200);
  } catch (error: any) {
    console.error('❌ MoonPay webhook error:', error.message);
    console.error('   Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
}