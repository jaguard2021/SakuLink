// src/services/circleService.ts
import { initiateDeveloperControlledWalletsClient, Blockchain, AccountType, FeeLevel } from '@circle-fin/developer-controlled-wallets';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import dotenv from 'dotenv';

dotenv.config();

// 🔍 DEBUG: Cek environment variables
console.log('🔍 DEBUG Circle Environment:');
console.log('  API_KEY exists:', !!process.env.CIRCLE_API_KEY);
console.log('  ENTITY_SECRET length:', process.env.CIRCLE_ENTITY_SECRET?.length);
console.log('  ENTITY_SECRET (first 10 chars):', process.env.CIRCLE_ENTITY_SECRET?.substring(0, 10));
console.log('  WALLET_SET_ID:', process.env.CIRCLE_WALLET_SET_ID);
console.log('  BLOCKCHAIN:', process.env.CIRCLE_DEFAULT_BLOCKCHAIN || 'ARC-TESTNET');

// ============================================================
// 🔐 Inisialisasi Circle Client
// ============================================================
const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// 📦 Konfigurasi dari .env
const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;
if (!WALLET_SET_ID) {
  throw new Error('CIRCLE_WALLET_SET_ID is not defined in .env');
}

// ✅ Pastikan tipe sesuai SDK: cast ke enum atau any
const BLOCKCHAIN = (process.env.CIRCLE_DEFAULT_BLOCKCHAIN || 'ARC-TESTNET') as Blockchain;
const ACCOUNT_TYPE = (process.env.CIRCLE_ACCOUNT_TYPE || 'SCA') as AccountType;
const FEE_LEVEL = (process.env.CIRCLE_FEE_LEVEL || 'MEDIUM') as FeeLevel;
const USDC_TOKEN_ID = process.env.CIRCLE_USDC_TOKEN_ID;

// ============================================================
// 🔐 1. Create Circle Wallet untuk User (ARC-TESTNET)
// ============================================================
export async function createCircleWallet(userId: string, userEmail: string) {
  console.log(`Creating Circle wallet for user on ${BLOCKCHAIN}`);

  // ✅ Hapus metadata karena menyebabkan error 400
  const payload = {
    walletSetId: WALLET_SET_ID!,
    blockchains: [BLOCKCHAIN],
    count: 1,
    accountType: ACCOUNT_TYPE,
  };

  console.log('CREATE WALLET PAYLOAD', JSON.stringify(payload, null, 2));

  try {
    const walletsResponse = await client.createWallets(payload);
    const wallet = walletsResponse.data?.wallets?.[0];
    if (!wallet) {
      throw new Error('Failed to create wallet');
    }

    console.log('✅ Wallet created successfully');
    console.log({
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.accountType,
    });

    // ❌ JANGAN SIMPAN KE PRISMA DI SINI - nanti disimpan di authController
    // Kembalikan data wallet saja, authController yang akan menyimpan ke database
    return {
      success: true,
      circleData: wallet,
      walletInfo: {
        circleWalletId: wallet.id,
        address: wallet.address,
        network: wallet.blockchain || BLOCKCHAIN,
        token: 'USDC',
      },
    };
  } catch (error: any) {
    console.error('❌ Circle wallet creation error:');
    console.error('   STATUS:', error.status);
    console.error('   RESPONSE:', error.response?.data);
    console.dir(error, { depth: null });
    throw error;
  }
}

// ============================================================
// 💰 2. Get Wallet Balance
// ============================================================
export async function getWalletBalance(circleWalletId: string) {
  try {
    const response = await client.getWalletTokenBalance({
      id: circleWalletId,
    });

    const balances =
      response.data?.tokenBalances?.map((item: any) => ({
        currency: item.token?.symbol || 'USDC',
        amount: item.amount || '0.00',
      })) || [{ currency: 'USDC', amount: '0.00' }];

    console.log(`Balance for wallet ${circleWalletId}:`, balances);
    return balances;
  } catch (error: any) {
    console.error(`Error fetching balance for ${circleWalletId}:`, error.message);
    return [{ currency: 'USDC', amount: '0.00' }];
  }
}

// ============================================================
// 🔍 3. Get Wallet Details
// ============================================================
export async function getWalletDetails(circleWalletId: string) {
  try {
    const response = await client.getWallet({
      id: circleWalletId,
    });
    return response.data?.wallet;
  } catch (error: any) {
    console.error('Error fetching wallet details:', error.message);
    return null;
  }
}

// ============================================================
// 🔄 4. Transfer USDC ke Treasury (dari user wallet)
// ============================================================
export async function transferToTreasury(
  userCircleWalletId: string,
  amount: string,
  treasuryAddress: string
) {
  if (!USDC_TOKEN_ID) {
    throw new Error('CIRCLE_USDC_TOKEN_ID is not defined in .env');
  }

  try {
    console.log(`Starting transfer of ${amount} USDC from user wallet to Treasury`);

    const response = await client.createTransaction({
      idempotencyKey: uuidv4(),
      walletId: userCircleWalletId,
      destinationAddress: treasuryAddress,
      tokenId: USDC_TOKEN_ID,
      amount: [amount],
      fee: {
        type: 'level',
        config: {
          feeLevel: FEE_LEVEL,
        },
      },
    });

    console.log('Transfer initiated successfully:', response.data);
    return {
      success: true,
      transferId: response.data?.id,
      state: response.data?.state,
      transactionHash: (response.data as any)?.transactionHash || null,
    };
  } catch (error: any) {
    console.error('Error executing transfer to treasury:', error.message);
    throw error;
  }
}