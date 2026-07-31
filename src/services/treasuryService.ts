export function getEthTreasuryWalletId(): string {
  const walletId = process.env.CIRCLE_TREASURY_WALLET_ID_ETH;

  if (!walletId) {
    throw new Error(
      'CIRCLE_TREASURY_WALLET_ID_ETH is not defined in .env'
    );
  }

  return walletId;
}

export function getArcTreasuryWalletId(): string {
  const walletId = process.env.CIRCLE_TREASURY_WALLET_ID_ARC;

  if (!walletId) {
    throw new Error(
      'CIRCLE_TREASURY_WALLET_ID_ARC is not defined in .env'
    );
  }

  return walletId;
}