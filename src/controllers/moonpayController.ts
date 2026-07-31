import { Request, Response } from 'express';
import { buildMoonPayWidgetUrl, getMoonPayQuote } from '../services/moonpayService';

interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || '0xb19a9290636245a703ee31b35b271ae89a8328ff';

export async function initiateMoonPayOnramp(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { amount, currency = 'USD', walletAddress } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be > 0' });
    }

    // Gunakan treasury wallet jika tidak dikirim dari frontend
    const targetWallet = walletAddress || TREASURY_WALLET;

    // 1. Dapatkan quote (estimasi) – optional
    let quote = null;
    try {
      quote = await getMoonPayQuote({
        baseCurrencyAmount: amount,
        baseCurrencyCode: currency,
        quoteCurrencyCode: 'USDC',
      });
    } catch (quoteError) {
      console.warn('⚠️ MoonPay quote failed, proceeding without quote:', quoteError);
    }

    // 2. Bangun URL widget MoonPay
    const widgetUrl = buildMoonPayWidgetUrl({
      walletAddress: targetWallet,
      baseCurrencyAmount: amount,
      baseCurrencyCode: currency,
      quoteCurrencyCode: 'USDC',
      redirectUrl: 'http://localhost:3000/success',
      failureRedirectUrl: 'http://localhost:3000/failure',
    });

    // 3. Response ke frontend – tidak simpan database di sini (webhook akan membuat record)
    res.status(200).json({
      success: true,
      paymentUrl: widgetUrl,
      quote: quote ? {
        cryptoAmount: quote.quoteCurrencyAmount || 0,
        fee: quote.feeAmount || 0,
        networkFee: quote.networkFeeAmount || 0,
      } : null,
    });
  } catch (error: any) {
    console.error('❌ MoonPay onramp error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate MoonPay onramp',
    });
  }
}