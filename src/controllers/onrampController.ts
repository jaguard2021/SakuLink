import { Request, Response } from 'express';
import { createTransFiOnrampOrder, createTransFiUser } from '../services/transfiService';
import prisma from '../lib/prisma';

interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

const TREASURY_WALLET =
  process.env.TREASURY_WALLET_ADDRESS ||
  '0xb19a9290636245a703ee31b35b271ae89a8328ff';

export async function initiateOnramp(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than zero',
      });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    let transFiUserId = dbUser.transfiUserId;

    if (!transFiUserId) {
      try {
        const transfiUser = await createTransFiUser({
          email: dbUser.email,
          firstName: dbUser.fullName?.split(' ')[0] || 'User',
          lastName:
            dbUser.fullName?.split(' ').slice(1).join(' ') || 'SakuLink',
          phone: dbUser.phone ?? undefined,
          phoneCode: dbUser.phoneCode ?? undefined,
          country: dbUser.country ?? undefined,
          countryOfResidence: dbUser.country ?? undefined,
          gender: dbUser.gender ?? undefined,
          address: {
            street: dbUser.street ?? undefined,
            city: dbUser.city ?? undefined,
            state: dbUser.state ?? undefined,
            postalCode: dbUser.postalCode ?? undefined,
          },
        });

        transFiUserId = transfiUser.data?.userId || transfiUser.userId;

        if (!transFiUserId) {
          throw new Error('TransFi user ID was not returned');
        }

        await prisma.user.update({
          where: { id: dbUser.id },
          data: {
            transfiUserId: transFiUserId,
          },
        });

        console.log(
          `User ${dbUser.email} registered to TransFi: ${transFiUserId}`
        );
      } catch (error: any) {
        console.error(
          'Failed to register TransFi user:',
          error.response?.data || error.message
        );

        return res.status(500).json({
          success: false,
          error: 'Failed to register TransFi user',
          details: error.response?.data || error.message,
        });
      }
    }

    if (!transFiUserId) {
      return res.status(500).json({
        success: false,
        error: 'Missing TransFi user ID',
      });
    }

    const result = await createTransFiOnrampOrder({
      userId: transFiUserId,
      amount,
      walletAddress: TREASURY_WALLET,
      successRedirectUrl: 'http://localhost:3000/success',
      failureRedirectUrl: 'http://localhost:3000/failure',
    });

    const order = await prisma.transfiOrder.create({
      data: {
        userId: dbUser.id,
        orderType: 'ONRAMP',
        provider: 'TRANSFI',
        providerOrderId: result.data.orderId,
        providerTraceId: result.traceId || null,
        amount,
        currency: 'USD',
        paymentType: 'bank_transfer',
        paymentCode: 'wire',
        crypto: 'USDCBASE',
        cryptoNetwork: 'Base',
        cryptoAmount: result.feeData?.withdrawAmount || 0,
        walletAddress: TREASURY_WALLET,
        walletOwner: 'exchange',
        successRedirectUrl: 'http://localhost:3000/success',
        failureRedirectUrl: 'http://localhost:3000/failure',
        payUrl: result.data.payUrl,
        payToken: result.data.payUrl?.split('paytoken=')[1] || null,
        status: 'PAYMENT_PENDING',
        fee: result.feeData?.totalFee || 0,
        rawResponse: result as any,
      },
    });

    return res.status(200).json({
      success: true,
      orderId: result.data.orderId,
      paymentUrl: result.data.payUrl,
      transactionId: order.id,
      fee: result.feeData?.totalFee || 0,
      cryptoAmount: result.feeData?.withdrawAmount || 0,
    });
  } catch (error: any) {
    console.error('Onramp error:', error.message);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process onramp',
    });
  }
}