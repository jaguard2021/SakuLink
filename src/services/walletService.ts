import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;
if (!WALLET_SET_ID) throw new Error('CIRCLE_WALLET_SET_ID is not defined');

const BLOCKCHAIN = process.env.CIRCLE_DEFAULT_BLOCKCHAIN || 'ETH-SEPOLIA';
const ACCOUNT_TYPE = process.env.CIRCLE_ACCOUNT_TYPE || 'EOA';
const FEE_LEVEL = process.env.CIRCLE_FEE_LEVEL || 'MEDIUM';
const USDC_TOKEN_ID = process.env.CIRCLE_USDC_TOKEN_ID;

export async function createCircleWallet(userId: string, userEmail: string) {
  const walletsResponse = await client.createWallets({
    idempotencyKey: uuidv4(),
    walletSetId: WALLET_SET_ID!,
    blockchains: [BLOCKCHAIN as any],
    count: 1,
    accountType: ACCOUNT_TYPE as any,
    metadata: [{ name: `SakuLink Wallet - ${userEmail}`, refId: userId }],
  });

  const wallet = walletsResponse.data?.wallets?.[0];
  if (!wallet) throw new Error('Failed to create wallet');

  const savedWallet = await prisma.wallet.create({
    data: {
      userId,
      circleWalletId: wallet.id,
      address: wallet.address,
      network: wallet.blockchain || BLOCKCHAIN,
      token: 'USDC',
    },
  });

  return { success: true, wallet: savedWallet, circleData: wallet };
}

export async function creditUserWallet(
  userId: string,
  amount: number,
  txHash: string,
  provider: string = 'MOONPAY'
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true },
  });

  if (!user || !user.wallet) throw new Error(`Wallet not found for user ${userId}`);

  await prisma.wallet.update({
    where: { userId },
    data: { balance: { increment: amount } },
  });

  const transfer = await client.createTransaction({
    idempotencyKey: `${userId}-${txHash}`,
    blockchain: 'ETH-SEPOLIA' as any,
    walletAddress: process.env.CIRCLE_TREASURY_WALLET_ADDRESS!,
    tokenAddress: process.env.CIRCLE_USDC_CONTRACT_ADDRESS!,
    destinationAddress: user.wallet.address,
    amount: [amount.toString()],
    fee: { type: 'level', config: { feeLevel: FEE_LEVEL as any } },
  });

  console.log(`✅ Transfer Circle ID: ${transfer.data?.id}`);
}

export async function getWalletBalance(circleWalletId: string) {
  try {
    const response = await client.getWalletTokenBalance({ id: circleWalletId });
    return response.data?.tokenBalances?.map((item: any) => ({
      currency: item.token?.symbol || 'USDC',
      amount: item.amount || '0.00',
    })) || [{ currency: 'USDC', amount: '0.00' }];
  } catch {
    return [{ currency: 'USDC', amount: '0.00' }];
  }
}

export async function getWalletDetails(circleWalletId: string) {
  try {
    const response = await client.getWallet({ id: circleWalletId });
    return response.data?.wallet;
  } catch {
    return null;
  }
}

export async function transferToTreasury(
  userCircleWalletId: string,
  amount: string,
  treasuryAddress: string
) {
  if (!USDC_TOKEN_ID) throw new Error('CIRCLE_USDC_TOKEN_ID is not defined');

  const response = await client.createTransaction({
    idempotencyKey: uuidv4(),
    blockchain: BLOCKCHAIN as any,
    walletAddress: userCircleWalletId,
    tokenAddress: process.env.CIRCLE_USDC_CONTRACT_ADDRESS!,
    destinationAddress: treasuryAddress,
    amount: [amount],
    fee: { type: 'level', config: { feeLevel: FEE_LEVEL as any } },
  });

  return {
    success: true,
    transferId: response.data?.id,
    state: response.data?.state,
  };
}

export async function checkUserBalance(userId: string, amount: number) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const balance = Number(wallet?.balance ?? 0);
  return { sufficient: balance >= amount, balance };
}

export async function getUserWalletId(userId: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet?.circleWalletId) throw new Error(`Wallet not found for user ${userId}`);
  return wallet.circleWalletId;
}