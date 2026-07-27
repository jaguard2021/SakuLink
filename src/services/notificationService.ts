import prisma from '../lib/prisma';

export async function requestConfirmation(params: {
  userId: string;
  transactionId: string;
  ruleId: string;
  amountUSDC: number;
  recipientName: string;
  idrAmount: number;
  rate: number;
  message: string;
}): Promise<{ confirmationId: string }> {
  console.log(
    `[NOTIFICATION] Request confirmation for user ${params.userId}`
  );

  console.log(`Transaction: ${params.transactionId}`);
  console.log(
    `Amount: ${params.amountUSDC} USDC → Rp ${params.idrAmount.toLocaleString()}`
  );
  console.log(`Recipient: ${params.recipientName}`);
  console.log(`Message: ${params.message}`);

  return {
    confirmationId: `confirm-${Date.now()}`,
  };
}

export async function checkConfirmation(
  confirmationId: string
): Promise<boolean> {
  console.log(
    `Checking confirmation: ${confirmationId}`
  );

  return true;
}