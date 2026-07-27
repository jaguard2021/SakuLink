// src/services/exchangeRateService.ts
import axios from 'axios';

const EXCHANGE_API_KEY = process.env.EXCHANGE_API_KEY;
const BASE_URL = 'https://api.exchangerate-api.com/v4/latest';

export async function getExchangeRate(from: string, to: string): Promise<number> {
  try {
    const response = await axios.get(`${BASE_URL}/${from}`);
    const rate = response.data.rates[to];
    if (!rate) {
      throw new Error(`Rate not found for ${from} → ${to}`);
    }
    return rate;
  } catch (error) {
    console.error('Exchange rate error:', error);
    throw new Error('Failed to get exchange rate');
  }
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  const rate = await getExchangeRate(from, to);
  return amount * rate;
}

/**
 * Cek apakah transfer harus ditunda karena kurs tidak menguntungkan
 * @param thresholdPercent - Persentase penurunan yang dianggap kritis (misal: 20)
 */
export async function shouldPauseTransfer(
  amountUSD: number,
  targetCurrency: string,
  thresholdPercent: number = 20
): Promise<{ pause: boolean; message?: string; rate?: number }> {
  try {
    // Ambil kurs USD → targetCurrency
    const rate = await getExchangeRate('USD', targetCurrency);
    const averageRate = 15500; // Contoh: rata-rata IDR/USD (bisa disimpan di database)

    // Hitung selisih persentase
    const diffPercent = ((rate - averageRate) / averageRate) * 100;

    if (diffPercent < -thresholdPercent) {
      return {
        pause: true,
        message: `Exchange rate dropped ${Math.abs(diffPercent).toFixed(2)}%. Please confirm transfer.`,
        rate,
      };
    }

    return {
      pause: false,
      rate,
    };
  } catch (error) {
    console.error('Exchange rate check error:', error);
    return { pause: false }; // Default: lanjutkan
  }
}