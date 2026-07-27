import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import prisma from '../lib/prisma';

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;

if (!WALLET_SET_ID) {
  throw new Error('CIRCLE_WALLET_SET_ID is not defined in .env');
}

const BLOCKCHAIN = process.env.CIRCLE_DEFAULT_BLOCKCHAIN || 'ARC-TESTNET';
const ACCOUNT_TYPE = process.env.CIRCLE_ACCOUNT_TYPE || 'SCA';
const FEE_LEVEL = process.env.CIRCLE_FEE_LEVEL || 'MEDIUM';
const USDC_TOKEN_ID = process.env.CIRCLE_USDC_TOKEN_ID;

export async function createCircleWallet(
  userId: string,
  userEmail: string
) {
  console.log(`Creating Circle wallet for user on ${BLOCKCHAIN}`);

  console.log('CREATE WALLET PAYLOAD');
  console.log({
    walletSetId: WALLET_SET_ID,
    blockchains: [BLOCKCHAIN],
    count: 1,
    accountType: ACCOUNT_TYPE,
  });

  try {
    const walletsResponse = await client.createWallets({
      walletSetId: WALLET_SET_ID!,
      blockchains: [BLOCKCHAIN as any],
      count: 1,
      accountType: ACCOUNT_TYPE as any,
      metadata: [
        {
          name: `SakuLink Wallet - ${userEmail}`,
          refId: userId,
        },
      ],
    });

    const wallet = walletsResponse.data?.wallets?.[0];

    if (!wallet) {
      throw new Error('Failed to create wallet');
    }

    console.log('Wallet created successfully');
    console.log(`Wallet ID: ${wallet.id}`);
    console.log(`Address: ${wallet.address}`);
    console.log(`Blockchain: ${wallet.blockchain}`);
    console.log(`Account Type: ${ACCOUNT_TYPE}`);

    const savedWallet = await prisma.wallet.create({
      data: {
        userId,
        circleWalletId: wallet.id,
        address: wallet.address,
        network: wallet.blockchain || BLOCKCHAIN,
        token: 'USDC',
      },
    });

    return {
      success: true,
      wallet: savedWallet,
      circleData: wallet,
    };
  } catch (error) {
    console.error('Circle wallet creation error:', error);
    throw error;
  }
}

export async function getWalletBalance(circleWalletId: string) {
  try {
    const response = await client.getWalletTokenBalance({
      id: circleWalletId,
    });

    console.log(
      `Balance fetched for wallet ${circleWalletId}:`,
      response.data?.tokenBalances
    );

    const balances =
      response.data?.tokenBalances?.map((item: any) => ({
        currency: item.token?.symbol || 'USDC',
        amount: item.amount || '0.00',
      })) || [
        {
          currency: 'USDC',
          amount: '0.00',
        },
      ];

    return balances;
  } catch (error: any) {
    console.error(
      `Error fetching balance for wallet ${circleWalletId}:`,
      error.message
    );

    return [
      {
        currency: 'USDC',
        amount: '0.00',
      },
    ];
  }
}

export async function getWalletDetails(circleWalletId: string) {
  try {
    const response = await client.getWallet({
      id: circleWalletId,
    });

    return response.data?.wallet;
  } catch (error: any) {
    console.error(
      'Error fetching wallet details:',
      error.message
    );

    return null;
  }
}

export async function transferToTreasury(
  userCircleWalletId: string,
  amount: string,
  treasuryAddress: string
) {
  if (!USDC_TOKEN_ID) {
    throw new Error('CIRCLE_USDC_TOKEN_ID is not defined in .env');
  }

  try {
    console.log(
      `Starting transfer of ${amount} USDC from user wallet to Treasury`
    );

    const response = await client.createTransaction({
      walletId: userCircleWalletId,
      destinationAddress: treasuryAddress,
      tokenId: USDC_TOKEN_ID,
      amount: [amount],
      fee: {
        type: 'level',
        config: {
          feeLevel: FEE_LEVEL as any,
        },
      },
    });

    console.log(
      'Transfer initiated successfully:',
      response.data
    );

    return {
      success: true,
      transferId: response.data?.id,
      state: response.data?.state,
      transactionHash:
        (response.data as any)?.transactionHash || null,
    };
  } catch (error: any) {
    console.error(
      'Error executing transfer to treasury:',
      error.message
    );

    throw error;
  }
}