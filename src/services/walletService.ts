import prisma from '../lib/prisma';
import { getWalletBalance } from './circleService';

export async function checkUserBalance(
  userId: string,
  requiredAmount: number
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.wallet) {
    throw new Error('User wallet not found');
  }

  const balances = await getWalletBalance(
    user.wallet.circleWalletId
  );

  const usdcBalance = balances.find(
    (b: any) => b.currency === 'USDC'
  );

  const currentBalance = usdcBalance
    ? parseFloat(usdcBalance.amount)
    : 0;

  return {
    user,
    wallet: user.wallet,
    balance: currentBalance,
    sufficient: currentBalance >= requiredAmount,
  };
}

export async function getUserWalletId(
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user?.wallet) {
    throw new Error('User wallet not found');
  }

  return user.wallet.circleWalletId;
}