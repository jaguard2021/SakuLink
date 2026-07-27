export function getBaseTreasuryWalletId(): string {
  const walletId = process.env.CIRCLE_TREASURY_WALLET_ID_BASE;

  if (!walletId) {
    throw new Error(
      'CIRCLE_TREASURY_WALLET_ID_BASE is not defined in .env'
    );
  }

  return walletId;
}

export function getArcTreasuryWalletId(): string {
  return getBaseTreasuryWalletId();
}