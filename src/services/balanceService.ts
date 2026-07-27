import { PrismaClient } from '@prisma/client';
import { convertCurrency, shouldPauseTransfer } from './exchangeRateService';

const prisma = new PrismaClient();

export async function convertAndCreditUsdBalance(
  reference: string,
  amountInFiat: number,
  currency: string,
  userId: string
) {
  try {
    console.log(
      `[BALANCE SERVICE] Processing deposit ${amountInFiat} ${currency} for user ${userId}`
    );

    const upperCurrency = currency.toUpperCase();
    let usdAmount = amountInFiat;

    if (upperCurrency !== 'USD') {
      usdAmount = await convertCurrency(amountInFiat, upperCurrency, 'USD');

      console.log(
        `[BALANCE SERVICE] Converted ${amountInFiat} ${upperCurrency} = ${usdAmount.toFixed(2)} USD`
      );
    }

    const finalUsdAmount = Number(usdAmount.toFixed(2));

    let userWallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!userWallet) {
      throw new Error(`Internal wallet for user ${userId} not found`);
    }

    const updatedWallet = await prisma.wallet.update({
      where: { userId },
      data: {
        balance: {
          increment: finalUsdAmount,
        },
      },
    });

    console.log(
      `[BALANCE SERVICE] Success. User ${userId} balance updated. New balance: $${updatedWallet.balance} USD`
    );

    return {
      success: true,
      fromCurrency: upperCurrency,
      fromAmount: amountInFiat,
      toCurrency: 'USD',
      creditedUsd: finalUsdAmount,
      newBalance: updatedWallet.balance,
    };

  } catch (error: any) {
    console.error(`[BALANCE SERVICE ERROR]:`, error.message);
    throw error;
  }
}