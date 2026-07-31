// src/services/bridgeKitService.ts

import { AppKit, BridgeChain } from '@circle-fin/app-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

// ── Circle Developer Controlled Wallets Client ──────────────────────────
const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

// ── App Kit Instance ─────────────────────────────────────────────────────
const kit = new AppKit();

// ── Adapter Factory (per request) ────────────────────────────────────────
function createAdapter() {
  return createCircleWalletsAdapter({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });
}

// ── Ambil address wallet user dari Circle ────────────────────────────────
async function getWalletAddress(walletId: string): Promise<string> {
  const response = await circleClient.getWallet({ id: walletId });
  const address = response.data?.wallet?.address;

  if (!address) {
    throw new Error(`Address not found for wallet ID: ${walletId}`);
  }

  return address;
}

// ── Bridge: User Arc Testnet → Treasury Ethereum Sepolia ─────────────────
export async function bridgeArcToEth(params: {
  sourceWalletId: string;      // walletId user dari DB Sakulink (Arc Testnet)
  destinationWalletId: string; // walletId Treasury Ethereum Sepolia
  amountUSDC: number;
}) {
  const { sourceWalletId, destinationWalletId, amountUSDC } = params;

  const sourceAddress      = await getWalletAddress(sourceWalletId);
  const destinationAddress = await getWalletAddress(destinationWalletId);

  console.log(`Bridge ${amountUSDC} USDC: Arc Testnet (${sourceAddress}) → ETH Sepolia (${destinationAddress})`);

  const adapter = createAdapter();

  const result = await kit.bridge({
    from: { adapter, chain: BridgeChain.Arc_Testnet,        address: sourceAddress },
    to:   { adapter, chain: BridgeChain.Ethereum_Sepolia,   address: destinationAddress },
    amount: amountUSDC.toString(),
  });

  return {
    transactionId: result.steps?.[0]?.txHash || `bridge-${Date.now()}`,
    state: 'success',
    steps: result.steps,
  };
}

// ── Bridge: Treasury Ethereum Sepolia → User Arc Testnet ─────────────────
export async function bridgeEthToArc(params: {
  sourceWalletId: string;      // walletId Treasury Ethereum Sepolia
  destinationWalletId: string; // walletId user dari DB Sakulink (Arc Testnet)
  amountUSDC: number;
}) {
  const { sourceWalletId, destinationWalletId, amountUSDC } = params;

  const sourceAddress      = await getWalletAddress(sourceWalletId);
  const destinationAddress = await getWalletAddress(destinationWalletId);

  console.log(`Bridge ${amountUSDC} USDC: ETH Sepolia (${sourceAddress}) → Arc Testnet (${destinationAddress})`);

  const adapter = createAdapter();

  const result = await kit.bridge({
    from: { adapter, chain: BridgeChain.Ethereum_Sepolia, address: sourceAddress },
    to:   { adapter, chain: BridgeChain.Arc_Testnet,       address: destinationAddress },
    amount: amountUSDC.toString(),
  });

  return {
    transactionId: result.steps?.[0]?.txHash || `bridge-${Date.now()}`,
    state: 'success',
    steps: result.steps,
  };
}