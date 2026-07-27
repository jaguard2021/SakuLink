import { Request, Response } from 'express';
import {
  transferToTreasury,
  getWalletBalance,
} from '../services/circleService';
import prisma from '../lib/prisma';

export async function sendRemittance(
  req: Request,
  res: Response
) {
  try {
    const userId =
      (req as any).user?.id || req.body.userId;

    const {
      amountUSDC,
      recipientBank,
      recipientAccount,
    } = req.body;

    if (!userId || !amountUSDC) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId or amountUSDC',
      });
    }

    const userWallet = await prisma.wallet.findFirst({
      where: {
        userId,
      },
    });

    if (!userWallet) {
      return res.status(404).json({
        success: false,
        message: 'User wallet not found',
      });
    }

    const balances = await getWalletBalance(
      userWallet.circleWalletId
    );

    const usdcBalance =
      balances.find(
        (b: any) => b.currency === 'USDC'
      )?.amount || '0.00';

    if (
      parseFloat(usdcBalance) <
      parseFloat(amountUSDC)
    ) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ${usdcBalance} USDC, Requested: ${amountUSDC} USDC`,
      });
    }

    const treasuryAddress =
      process.env.TREASURY_WALLET_ADDRESS;

    if (!treasuryAddress) {
      throw new Error(
        'TREASURY_WALLET_ADDRESS is not defined in .env'
      );
    }

    const transferResult =
      await transferToTreasury(
        userWallet.circleWalletId,
        amountUSDC.toString(),
        treasuryAddress
      );

    const numericUsdc =
      parseFloat(amountUSDC);

    const transaction =
      await prisma.transaction.create({
        data: {
          userId,
          type: 'REMITTANCE',
          status: 'PENDING',
          currency: 'USDC',
          amount: numericUsdc,
          usdcAmount: numericUsdc,
          circleTxId:
            transferResult.transferId,
        },
      });

    return res.status(200).json({
      success: true,
      message:
        'Remittance transfer initiated successfully',
      data: {
        transactionId: transaction.id,
        transferId:
          transferResult.transferId,
        state: transferResult.state,
        txHash:
          transferResult.transactionHash,
        recipientBank,
        recipientAccount,
      },
    });
  } catch (error: any) {
    console.error(
      'Error in sendRemittance:',
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

export async function getRemittanceHistory(
  req: Request,
  res: Response
) {
  try {
    const userId =
      (req as any).user?.id ||
      req.query.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing userId',
      });
    }

    const transactions =
      await prisma.transaction.findMany({
        where: {
          userId: userId as string,
          type: 'REMITTANCE',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    return res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error: any) {
    console.error(
      'Error fetching remittance history:',
      error.message
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}