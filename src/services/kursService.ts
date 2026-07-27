import dotenv from 'dotenv';

dotenv.config();

class KursService {
  private apiKey: string;
  private currentRates: Record<string, number> | null = null;
  private lastUpdate: Date | null = null;

  constructor() {
    this.apiKey =
      process.env.EXCHANGE_API_KEY || '56cda0087e5809ceafeaf154';

    console.log(
      `KursService initialized | API Key: ${
        process.env.EXCHANGE_API_KEY ? '.env' : 'Fallback'
      }`
    );
  }

  async fetchKurs(): Promise<Record<string, number> | null> {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${this.apiKey}/latest/USD`;

      console.log(`Fetching live rate from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = (await response.json()) as any;

      if (data.result === 'success') {
        this.currentRates = data.conversion_rates;
        this.lastUpdate = new Date();

        console.log('Exchange rates updated');

        return this.currentRates;
      }

      throw new Error(data['error-type'] || 'Failed to fetch exchange rate');
    } catch (error: any) {
      console.error(
        'KursService Error:',
        error.message
      );

      return null;
    }
  }

  async convertFiatToUSDC(
    fiatAmount: number,
    currency: string
  ): Promise<{ usdcAmount: number; rateUsed: number }> {
    if (!this.currentRates) {
      await this.fetchKurs();
    }

    const code = currency.toUpperCase();
    const rateAgainstUSD = this.currentRates?.[code];

    if (!rateAgainstUSD) {
      throw new Error(`Exchange rate for ${code} not found`);
    }

    const usdcAmount = parseFloat(
      (fiatAmount / rateAgainstUSD).toFixed(2)
    );

    return {
      usdcAmount,
      rateUsed: rateAgainstUSD,
    };
  }
}

export const kursService = new KursService();