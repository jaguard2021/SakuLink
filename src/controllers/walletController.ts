import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getWalletBalance } from '../services/circleService';

export async function getBalance(req: Request, res: Response): Promise<any> {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User ID not found' });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return res.status(404).json({ success: false, error: 'Wallet not found for this user' });
    }

    const balances = await getWalletBalance(wallet.circleWalletId);

    return res.status(200).json({
      success: true,
      data: {
        address: wallet.address,
        network: wallet.network,
        balances,
      },
    });
  } catch (error: any) {
    console.error('Error getting wallet balance:', error.message);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}