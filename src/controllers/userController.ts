import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
  createCircleWallet,
  getWalletBalance,
} from '../services/circleService';

export const register = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      fullName,
      email,
      password,
      country,
      identityType,
      identityNumber,
    } = req.body;

    if (
      !fullName ||
      !email ||
      !password ||
      !country ||
      !identityType
    ) {
      return res.status(400).json({
        success: false,
        error:
          'Missing required fields: fullName, email, password, country, identityType',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        country,
        identityType,
        identityNumber: identityNumber || null,
      },
    });

    console.log(`Creating Circle wallet for user: ${user.email}`);

    try {
      await createCircleWallet(user.id, user.email);
      console.log(`Wallet created for user: ${user.email}`);
    } catch (walletError) {
      console.error(
        `Failed to create wallet for user ${user.email}:`,
        walletError
      );
    }

    const userWithWallet = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        wallet: true,
      },
    });

    const { password: _, ...userWithoutPassword } =
      userWithWallet!;

    res.status(201).json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error: any) {
    if (
      error.code === 'P2002' &&
      error.meta?.target?.includes('email')
    ) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered',
      });
    }

    console.error('Registration error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const getProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        recipients: true,
        rules: {
          where: {
            active: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    let walletBalance = null;
    const balanceCurrency = 'USDC';

    if (user.wallet) {
      try {
        const balances = await getWalletBalance(
          user.wallet.circleWalletId
        );

        const usdcBalance = balances.find(
          (b: any) => b.currency === 'USDC'
        );

        walletBalance = usdcBalance
          ? parseFloat(usdcBalance.amount)
          : 0;

        console.log(
          `Balance fetched from Circle: ${walletBalance} USDC`
        );
      } catch (error) {
        console.error(
          'Failed to fetch balance from Circle:',
          error
        );

        walletBalance = 0;
      }
    }

    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      data: {
        ...userWithoutPassword,
        balance: walletBalance,
        balanceCurrency,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};

export const updateProfile = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).userId;

    const {
      fullName,
      country,
      identityNumber,
    } = req.body;

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        fullName: fullName || undefined,
        country: country || undefined,
        identityNumber:
          identityNumber || undefined,
      },
      include: {
        wallet: true,
      },
    });

    const { password: _, ...userWithoutPassword } =
      updatedUser;

    res.status(200).json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error) {
    console.error('Update profile error:', error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};