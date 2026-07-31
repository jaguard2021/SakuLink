// src/services/moonpayService.ts
import axios from 'axios';
import crypto from 'crypto';

const MOONPAY_BASE_URL = 'https://buy.moonpay.com';
const MOONPAY_PUBLISHABLE_KEY = process.env.MOONPAY_PUBLISHABLE_KEY || '';
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || '';

// ============================================================
// 📦 Helper: Normalisasi currency ke lowercase
// ============================================================
function normalizeCurrency(code: string): string {
  return code.toLowerCase();
}

// ============================================================
// 🔐 Generate signed MoonPay URL
// ============================================================
export function generateSignedMoonPayUrl(baseUrl: string): string {
  // Parse URL untuk mendapatkan query string
  const url = new URL(baseUrl);
  const queryString = url.search; // includes '?' prefix

  if (!MOONPAY_SECRET_KEY) {
    console.warn('⚠️ MOONPAY_SECRET_KEY is not set, URL will not be signed');
    return baseUrl;
  }

  // Generate HMAC-SHA256 signature dari query string
  const signature = crypto
    .createHmac('sha256', MOONPAY_SECRET_KEY)
    .update(queryString)
    .digest('base64');

  // Append signature parameter (URL-encoded)
  url.searchParams.append('signature', signature);

  return url.toString();
}

// ============================================================
// 🚀 Build MoonPay Widget URL (dengan signature)
// ============================================================
export function buildMoonPayWidgetUrl(params: {
  walletAddress: string;
  baseCurrencyAmount: number;
  baseCurrencyCode?: string; // default 'usd'
  quoteCurrencyCode?: string; // default 'usdc'
  redirectUrl?: string;
  failureRedirectUrl?: string;
}): string {
  const {
    walletAddress,
    baseCurrencyAmount,
    baseCurrencyCode = 'usd',
    quoteCurrencyCode = 'usdc',
    redirectUrl = 'http://localhost:3000/success',
    failureRedirectUrl = 'http://localhost:3000/failure',
  } = params;

  const base = normalizeCurrency(baseCurrencyCode);
  const quote = normalizeCurrency(quoteCurrencyCode);

  // 1. Bangun URL dasar (tanpa signature)
  const url = new URL(MOONPAY_BASE_URL);
  url.searchParams.append('apiKey', MOONPAY_PUBLISHABLE_KEY);
  url.searchParams.append('walletAddress', walletAddress);
  url.searchParams.append('baseCurrencyCode', base);
  url.searchParams.append('currencyCode', quote);
  url.searchParams.append('baseCurrencyAmount', baseCurrencyAmount.toString());
  url.searchParams.append('redirectUrl', redirectUrl);
  url.searchParams.append('failureRedirectUrl', failureRedirectUrl);

  // Opsional: tambahkan network jika diperlukan
  // url.searchParams.append('network', 'ethereum');

  // 2. Tandatangani URL dengan secret key
  const unsignedUrl = url.toString();
  const signedUrl = generateSignedMoonPayUrl(unsignedUrl);

  return signedUrl;
}

// ============================================================
// 🔍 Get MoonPay quote (untuk estimasi)
// ============================================================
export async function getMoonPayQuote(params: {
  baseCurrencyAmount: number;
  baseCurrencyCode?: string;
  quoteCurrencyCode?: string;
}) {
  const { baseCurrencyAmount, baseCurrencyCode = 'usd', quoteCurrencyCode = 'usdc' } = params;
  const base = normalizeCurrency(baseCurrencyCode);
  const quote = normalizeCurrency(quoteCurrencyCode);

  try {
    const response = await axios.get(
      `https://api.moonpay.com/v3/currencies/${quote}/buy_quote`,
      {
        params: {
          apiKey: MOONPAY_PUBLISHABLE_KEY,
          baseCurrencyAmount,
          baseCurrencyCode: base,
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('❌ MoonPay quote error:', error.response?.data || error.message);
    throw new Error('Failed to get MoonPay quote');
  }
}