// src/services/airwallexService.ts
import axios from 'axios';

const AIRWALLEX_BASE_URL = process.env.AIRWALLEX_BASE_URL || 'https://api-demo.airwallex.com/api/v1';
const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID || '';
const API_KEY = process.env.AIRWALLEX_API_KEY || '';

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;

async function getAccessToken(): Promise<string> {
  if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return accessToken;
  }

  try {
    const response = await axios.post(
      `${AIRWALLEX_BASE_URL}/authentication/login`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': CLIENT_ID,
          'x-api-key': API_KEY,
        },
      }
    );

    const newToken = response.data.token;
    if (!newToken) {
      throw new Error('No token received from Airwallex');
    }

    accessToken = newToken;
    tokenExpiresAt = Date.now() + 4.5 * 60 * 1000;
    console.log('✅ Airwallex access token obtained');
    return newToken;
  } catch (error: any) {
    console.error('❌ Airwallex auth error:', error.response?.data || error.message);
    throw new Error('Failed to authenticate with Airwallex');
  }
}

export async function getExchangeRate(params: {
  sellCurrency: string;
  buyCurrency: string;
  sellAmount?: number;
  buyAmount?: number;
}): Promise<{
  rate: number;
  buyAmount: number;
  sellAmount: number;
}> {
  const token = await getAccessToken();

  const { sellCurrency, buyCurrency, sellAmount, buyAmount } = params;

  try {
    const response = await axios.get(
      `${AIRWALLEX_BASE_URL}/fx/rates/current`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: {
          sell_currency: sellCurrency,
          buy_currency: buyCurrency,
          ...(sellAmount && { sell_amount: sellAmount }),
          ...(buyAmount && { buy_amount: buyAmount }),
        },
      }
    );

    // 🔍 Log raw response untuk debug
    console.log('📦 AIRWALLEX RAW RESPONSE:');
    console.log(JSON.stringify(response.data, null, 2));

    const data = response.data;

    // 🧠 Analisis: Response memiliki field `rate` yang merupakan rate buy/sell
    // Misal: { "rate": 1.304381, ... } 
    // Artinya 1 USD = 1.304381 SGD
    // Kita butuh 1 SGD = ? USD, jadi rateSGDToUSD = 1 / data.rate

    const rawRate = data.rate;
    if (!rawRate) {
      throw new Error('Rate not found in Airwallex response');
    }

    // Konversi rate ke SGD/USD
    const rateSGDToUSD = 1 / rawRate;

    // Jika response memberikan buy_amount, pakai, jika tidak hitung dari sellAmount
    let buyAmountValue: number;
    if (data.buy_amount) {
      buyAmountValue = Number(data.buy_amount);
    } else if (sellAmount) {
      buyAmountValue = Number((sellAmount * rateSGDToUSD).toFixed(2));
    } else {
      buyAmountValue = 0;
    }

    console.log(`💱 Rate: 1 ${sellCurrency} = ${rateSGDToUSD} ${buyCurrency}`);
    console.log(`💱 Conversion: ${sellAmount || '?'} ${sellCurrency} → ${buyAmountValue} ${buyCurrency}`);

    return {
      rate: rateSGDToUSD,
      buyAmount: buyAmountValue,
      sellAmount: sellAmount || data.sell_amount || 0,
    };
  } catch (error: any) {
    console.error('❌ Airwallex rate error:', error.response?.data || error.message);
    throw new Error('Failed to get exchange rate from Airwallex');
  }
}

export async function convertCurrency(params: {
  sellCurrency: string;
  buyCurrency: string;
  sellAmount: number;
}): Promise<{
  conversionId: string;
  sellAmount: number;
  buyAmount: number;
  rate: number;
  status: string;
}> {
  const token = await getAccessToken();

  const { sellCurrency, buyCurrency, sellAmount } = params;

  try {
    const response = await axios.post(
      `${AIRWALLEX_BASE_URL}/conversions/create`,
      {
        sell_currency: sellCurrency,
        buy_currency: buyCurrency,
        sell_amount: sellAmount,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    console.log(`✅ Conversion ${data.id}: ${sellAmount} ${sellCurrency} → ${data.buy_amount} ${buyCurrency}`);

    return {
      conversionId: data.id,
      sellAmount: data.sell_amount,
      buyAmount: data.buy_amount,
      rate: data.rate,
      status: data.status,
    };
  } catch (error: any) {
    console.error('❌ Airwallex conversion error:', error.response?.data || error.message);
    throw new Error('Failed to execute currency conversion');
  }
}