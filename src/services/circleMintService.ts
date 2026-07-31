// src/services/circleMintService.ts
/**
 * Circle Mint Service – Fiat Deposit, USDC Minting, & Transfer to Blockchain
 *
 * FLOW LENGKAP:
 * 1. Daftarkan bank account (wire) ke Circle Mint
 * 2. Dapatkan instruksi wire (trackingRef, beneficiary account)
 * 3. Deposit fiat (mock wire di sandbox) → mint USDC 1:1 ke Master Wallet
 * 4. Transfer USDC dari Master Wallet ke blockchain wallet (ARC, ETH, BASE, dll.)
 *
 * Semua fungsi di file ini menggunakan Circle Mint API.
 * Dokumentasi: https://developers.circle.com/stablecoins/reference
 */

import axios from 'axios';
import crypto from 'crypto';

// ============================================================
// 🔐 Konfigurasi & Client
// ============================================================

const CIRCLE_MINT_BASE_URL = process.env.CIRCLE_MINT_BASE_URL || 'https://api-sandbox.circle.com';
const CIRCLE_MINT_API_KEY = process.env.CIRCLE_MINT_API_KEY || '';

if (!CIRCLE_MINT_API_KEY) {
  console.warn('⚠️  CIRCLE_MINT_API_KEY tidak ditemukan di .env. Fitur Circle Mint tidak akan berfungsi.');
}

const mintClient = axios.create({
  baseURL: CIRCLE_MINT_BASE_URL,
  headers: {
    'Authorization': `Bearer ${CIRCLE_MINT_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// ============================================================
// 💾 Caching Master Wallet ID (In-Memory + .env Fallback)
// ============================================================

let _cachedMasterWalletId: string | null = process.env.CIRCLE_MASTER_WALLET_ID || null;

// ============================================================
// 📦 Interfaces
// ============================================================

export interface WireBankAccount {
  id: string;
  status: 'pending' | 'complete' | 'failed';
  trackingRef: string;
  fingerprint: string;
  billingDetails: {
    name: string;
    line1: string;
    city: string;
    postalCode: string;
    district: string;
    country: string;
  };
  bankAddress: {
    bankName: string;
    city: string;
    district: string;
    country: string;
  };
  createDate: string;
  updateDate: string;
}

export interface WireInstructions {
  trackingRef: string;
  beneficiary: {
    name: string;
    address1: string;
    address2?: string;
  };
  beneficiaryBank: {
    name: string;
    routingNumber: string;
    accountNumber: string;
    swiftCode?: string;
    currency?: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface MintBalance {
  available: { amount: string; currency: string }[];
  unsettled: { amount: string; currency: string }[];
}

export interface MockWireDepositResponse {
  trackingRef: string;
  amount: { amount: string; currency: string };
  status: 'pending' | 'processed' | 'failed';
}

export interface BlockchainTransferResponse {
  id: string;
  source: {
    type: string;
    id: string;
  };
  destination: {
    type: string;
    address: string;
    chain: string;
  };
  amount: {
    amount: string;
    currency: string;
  };
  status: 'pending' | 'running' | 'complete' | 'failed';
  transactionHash?: string;
  createDate: string;
  updateDate: string;
}

export interface RecipientAddressResponse {
  id: string;
  address: string;
  chain: string;
  status: string;
}

// ============================================================
// 🏦 1. Daftarkan Bank Account (Wire)
// ============================================================

export async function createWireBankAccount(params: {
  idempotencyKey: string;
  accountNumber: string;
  routingNumber: string;
  billingDetails: {
    name: string;
    city: string;
    country: string;
    line1: string;
    postalCode: string;
    district: string;
  };
  bankAddress: {
    bankName: string;
    city: string;
    country: string;
    line1: string;
    district: string;
  };
}): Promise<WireBankAccount> {
  const billing = {
    name: params.billingDetails.name || 'SakuLink Treasury',
    city: params.billingDetails.city || 'Boston',
    country: params.billingDetails.country || 'US',
    line1: params.billingDetails.line1 || '100 Money Street',
    postalCode: params.billingDetails.postalCode || '01234',
    district: params.billingDetails.district || 'MA',
  };
  const bankAddr = {
    bankName: params.bankAddress.bankName || 'WELLS FARGO BANK, NA',
    city: params.bankAddress.city || 'San Francisco',
    country: params.bankAddress.country || 'US',
    line1: params.bankAddress.line1 || '420 Montgomery Street',
    district: params.bankAddress.district || 'CA',
  };

  const payload = {
    idempotencyKey: params.idempotencyKey,
    accountNumber: params.accountNumber,
    routingNumber: params.routingNumber,
    billingDetails: billing,
    bankAddress: bankAddr,
  };

  try {
    const response = await mintClient.post('/v1/businessAccount/banks/wires', payload);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendaftarkan bank account:', error.response?.data || error.message);
    throw new Error(`Circle Mint - create bank account: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 📄 2. Dapatkan Instruksi Wire
// ============================================================

export async function getWireInstructions(bankAccountId: string): Promise<WireInstructions> {
  try {
    const response = await mintClient.get(
      `/v1/businessAccount/banks/wires/${bankAccountId}/instructions`
    );
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendapatkan instruksi wire:', error.response?.data || error.message);
    throw new Error(`Circle Mint - get wire instructions: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 💰 3. Deposit Fiat via Mock Wire (Sandbox)
// ============================================================

export async function mockWireDeposit(params: {
  idempotencyKey: string;
  amount: string;
  trackingRef: string;
  beneficiaryAccountNumber: string;
}): Promise<MockWireDepositResponse> {
  const payload = {
    idempotencyKey: params.idempotencyKey,
    amount: {
      amount: params.amount,
      currency: 'USD',
    },
    trackingRef: params.trackingRef,
    beneficiaryBank: {
      accountNumber: params.beneficiaryAccountNumber,
    },
  };

  try {
    const response = await mintClient.post('/v1/mocks/payments/wire', payload);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal melakukan mock wire deposit:', error.response?.data || error.message);
    throw new Error(`Circle Mint - mock wire deposit: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 💰 4. Cek Balance Circle Mint
// ============================================================

export async function getMintBalance(): Promise<MintBalance> {
  try {
    const response = await mintClient.get('/v1/businessAccount/balances');
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendapatkan balance:', error.response?.data || error.message);
    throw new Error(`Circle Mint - get balance: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 🏦 5. Dapatkan Master Wallet ID (dengan Caching)
// ============================================================

export async function getMasterWalletId(): Promise<string> {
  if (_cachedMasterWalletId) {
    console.log(`✅ Master Wallet ID dari cache: ${_cachedMasterWalletId}`);
    return _cachedMasterWalletId;
  }

  try {
    const response = await mintClient.get('/v1/configuration');
    const masterWalletId = response.data.data.payments.masterWalletId;

    if (!masterWalletId) {
      throw new Error('Master Wallet ID tidak ditemukan di response API');
    }

    _cachedMasterWalletId = masterWalletId;
    console.log(`💡 Simpan ke .env: CIRCLE_MASTER_WALLET_ID=${masterWalletId}`);
    return masterWalletId;
  } catch (error: any) {
    console.error('❌ Gagal mendapatkan Master Wallet ID:', error.response?.data || error.message);
    throw new Error(`Circle Mint - get master wallet: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 📌 RESET CACHE
// ============================================================

export function resetMasterWalletCache(): void {
  _cachedMasterWalletId = null;
  console.log('🔄 Master Wallet ID cache di-reset');
}

// ============================================================
// 📬 6. Daftarkan Recipient Address
// ============================================================

export async function createRecipientAddress(params: {
  idempotencyKey: string;
  address: string;
  chain: string;
  description?: string;
}): Promise<RecipientAddressResponse> {
  const payload = {
    idempotencyKey: params.idempotencyKey,
    address: params.address,
    chain: params.chain,
    description: params.description || 'SakuLink recipient',
  };

  try {
    const response = await mintClient.post('/v1/businessAccount/wallets/addresses/recipient', payload);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendaftarkan recipient address:', error.response?.data || error.message);
    throw new Error(`Circle Mint - create recipient: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 📬 6b. Cek Status Recipient Address
// ============================================================

export async function getRecipientAddressStatus(addressId: string): Promise<any> {
  try {
    const response = await mintClient.get(`/v1/businessAccount/wallets/addresses/recipient/${addressId}`);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendapatkan status recipient address:', error.response?.data || error.message);
    throw new Error(`Circle Mint - get recipient status: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 💰 7. Transfer ke Verified Recipient (TANPA source)
// ============================================================

export async function transferToVerifiedRecipient(params: {
  idempotencyKey: string;
  addressId: string;
  amount: string;
}): Promise<BlockchainTransferResponse> {
  if (!params.addressId) {
    throw new Error('addressId wajib diisi');
  }
  if (!params.amount || parseFloat(params.amount) <= 0) {
    throw new Error('Amount harus lebih dari 0');
  }

  // 🔥 Perbaikan: Hapus source, Circle Mint otomatis menggunakan Master Wallet
  const payload = {
    idempotencyKey: params.idempotencyKey,
    destination: {
      type: 'verified_blockchain',
      addressId: params.addressId,
    },
    amount: {
      amount: params.amount,
      currency: 'USD',
    },
  };

  console.log('🚀 Transfer to verified recipient payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await mintClient.post('/v1/businessAccount/transfers', payload);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal transfer ke verified recipient:', error.response?.data || error.message);
    throw new Error(`Circle Mint - transfer verified: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 🔍 8. Cek Status Transfer
// ============================================================

export async function getTransferStatus(transferId: string): Promise<BlockchainTransferResponse> {
  try {
    const response = await mintClient.get(`/v1/businessAccount/transfers/${transferId}`);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Gagal mendapatkan status transfer:', error.response?.data || error.message);
    throw new Error(`Circle Mint - get transfer status: ${error.response?.data?.message || error.message}`);
  }
}

// ============================================================
// 🧪 9. Full Flow Testing (Sandbox)
// ============================================================

export async function fullMockDepositAndTransfer(
  amount: string = '100.00',
  destinationAddress?: string,
  chain: string = 'ARC'
): Promise<{
  bankAccount: WireBankAccount;
  wireInstructions: WireInstructions;
  deposit: MockWireDepositResponse;
  transfer?: BlockchainTransferResponse;
}> {
  const idempotencyKey = crypto.randomUUID();

  // Step 1: Daftar bank account
  const account = await createWireBankAccount({
    idempotencyKey: crypto.randomUUID(),
    accountNumber: '12340010',
    routingNumber: '121000248',
    billingDetails: {
      name: 'SakuLink Treasury',
      city: 'Boston',
      country: 'US',
      line1: '100 Money Street',
      postalCode: '01234',
      district: 'MA',
    },
    bankAddress: {
      bankName: 'WELLS FARGO BANK, NA',
      city: 'San Francisco',
      country: 'US',
      line1: '420 Montgomery Street',
      district: 'CA',
    },
  });
  console.log(`✅ Bank account created: ${account.id}`);

  // Step 2: Dapatkan instruksi wire
  const instructions = await getWireInstructions(account.id);
  console.log(`✅ Wire instructions received, trackingRef: ${instructions.trackingRef}`);

  // Step 3: Mock wire deposit (mint USDC)
  const deposit = await mockWireDeposit({
    idempotencyKey: crypto.randomUUID(),
    amount,
    trackingRef: instructions.trackingRef,
    beneficiaryAccountNumber: instructions.beneficiaryBank.accountNumber,
  });
  console.log(`✅ Mock wire deposit initiated: ${deposit.status}`);

  const result: any = {
    bankAccount: account,
    wireInstructions: instructions,
    deposit,
  };

  // Step 4: Transfer ke blockchain jika destinationAddress diberikan
  if (destinationAddress) {
    const recipient = await createRecipientAddress({
      idempotencyKey: crypto.randomUUID(),
      address: destinationAddress,
      chain,
      description: 'Treasury wallet',
    });
    console.log(`✅ Recipient address registered: ${recipient.id}`);

    // Tunggu sebentar agar recipient address aktif
    console.log('⏳ Menunggu 3 detik agar recipient address aktif...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const transfer = await transferToVerifiedRecipient({
      idempotencyKey: crypto.randomUUID(),
      addressId: recipient.id,
      amount,
    });
    console.log(`✅ Transfer initiated: ${transfer.id}, status: ${transfer.status}`);
    result.transfer = transfer;
  }

  return result;
}