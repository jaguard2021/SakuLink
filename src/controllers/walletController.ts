// src/controllers/walletController.ts
import { Request, Response } from 'express';
import prisma from '../lib/prisma';

interface AuthRequest extends Request {
  userId?: string;
}

// ============================================================
// 💰 CEK SALDO CRYPTO (USDC) – MEMBACA DARI DATABASE (INTERNAL LEDGER)
// ============================================================
export async function getBalance(req: AuthRequest, res: Response): Promise<any> {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: User ID not found',
      });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found for this user',
      });
    }

    // 🔥 Saldo dibaca dari database (internal ledger), bukan dari Circle API
    // Format response disesuaikan agar kompatibel dengan frontend yang sudah ada
    return res.status(200).json({
      success: true,
      data: {
        address: wallet.address,
        network: wallet.network,
        // Balances array agar konsisten dengan response sebelumnya
        balances: [
          {
            currency: 'USDC',
            amount: wallet.balance.toFixed(2), // format 2 desimal
          },
        ],
        // Tambahkan balance sebagai angka untuk kemudahan frontend
        balance: wallet.balance,
        token: 'USDC',
      },
    });
  } catch (error: any) {
    console.error('Error getting wallet balance:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}

// ============================================================
// 💰 CEK SALDO FIAT (SGD & USD)
// ============================================================
export async function getFiatBalance(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const fiatAccount = await prisma.fiatAccount.findUnique({
      where: { userId },
    });

    if (!fiatAccount) {
      return res.status(200).json({
        success: true,
        data: {
          currency: 'SGD',
          localAmount: 0,
          usdBalance: 0,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        currency: fiatAccount.currency,
        localAmount: fiatAccount.localAmount,
        usdBalance: fiatAccount.usdBalance,
      },
    });
  } catch (error: any) {
    console.error('Get fiat balance error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}