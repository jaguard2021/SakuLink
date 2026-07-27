import { BridgeKit } from '@circle-fin/bridge-kit';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const circleClient = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const adapter = createCircleWalletsAdapter({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

const bridgeKit = new BridgeKit();

async function getWalletAddress(walletId: string): Promise<string> {
  try {
    const response = await circleClient.getWallet({ id: walletId });
    const address = response.data?.wallet?.address;

    if (!address) {
      throw new Error(`Address not found for wallet ID: ${walletId}`);
    }

    console.log(`Fetched address for wallet ${walletId}: ${address}`);

    return address;
  } catch (error: any) {
    console.error(
      `Failed to fetch wallet address for ${walletId}:`,
      error.message
    );

    throw error;
  }
}

export async function bridgeBaseToArc(params: {
  sourceWalletId: string;
  destinationWalletId: string;
  amountUSDC: number;
}) {
  const { sourceWalletId, destinationWalletId, amountUSDC } = params;

  console.log(
    `Preparing bridge: ${amountUSDC} USDC from Base Sepolia to Arc Testnet`
  );

  try {
    const sourceAddress = await getWalletAddress(sourceWalletId);
    const destinationAddress = await getWalletAddress(destinationWalletId);

    console.log(
      `Source Address: ${sourceAddress}\nDestination Address: ${destinationAddress}`
    );

    const result = await bridgeKit.bridge({
      from: {
        adapter,
        chain: 'Base_Sepolia',
        address: sourceAddress,
      } as any,
      to: {
        adapter,
        chain: 'Arc_Testnet',
        address: destinationAddress,
      } as any,
      amount: amountUSDC.toString(),
    } as any);

    console.log(`Bridge result state: ${result.state}`);

    const mintStep = (result.steps as any)?.find(
      (s: any) => s.name === 'mint'
    );

    const txHash = mintStep?.txHash || (result as any).txHash;

    return {
      transactionId: txHash || `bridge-${Date.now()}`,
      state: result.state,
      steps: result.steps,
    };
  } catch (error: any) {
    console.error(
      'Bridge Base to Arc failed:',
      error.message
    );

    throw error;
  }
}

export async function bridgeArcToBase(params: {
  sourceWalletId: string;
  destinationWalletId: string;
  amountUSDC: number;
}) {
  const { sourceWalletId, destinationWalletId, amountUSDC } = params;

  console.log(
    `Preparing bridge: ${amountUSDC} USDC from Arc Testnet to Base Sepolia`
  );

  try {
    const sourceAddress = await getWalletAddress(sourceWalletId);
    const destinationAddress = await getWalletAddress(destinationWalletId);

    const result = await bridgeKit.bridge({
      from: {
        adapter,
        chain: 'Arc_Testnet',
        address: sourceAddress,
      } as any,
      to: {
        adapter,
        chain: 'Base_Sepolia',
        address: destinationAddress,
      } as any,
      amount: amountUSDC.toString(),
    } as any);

    console.log(`Bridge result state: ${result.state}`);

    const mintStep = (result.steps as any)?.find(
      (s: any) => s.name === 'mint'
    );

    const txHash = mintStep?.txHash || (result as any).txHash;

    return {
      transactionId: txHash || `bridge-${Date.now()}`,
      state: result.state,
      steps: result.steps,
    };
  } catch (error: any) {
    console.error(
      'Bridge Arc to Base failed:',
      error.message
    );

    throw error;
  }
}

export async function waitForBridgeCompletion(
  result: any,
  maxAttempts: number = 30,
  intervalMs: number = 2000
): Promise<{ completed: boolean; state: string }> {
  console.log('Waiting for bridge completion');

  return new Promise((resolve) => {
    let attempts = 0;

    const checkState = () => {
      attempts++;

      if (result.state === 'success') {
        console.log('Bridge completed successfully');

        resolve({
          completed: true,
          state: result.state,
        });

        return;
      }

      if (result.state === 'error' || result.state === 'failed') {
        console.log(`Bridge failed: ${result.state}`);

        resolve({
          completed: false,
          state: result.state,
        });

        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(checkState, intervalMs);
      } else {
        console.log(
          `Bridge timeout after ${maxAttempts} attempts`
        );

        resolve({
          completed: false,
          state: 'TIMEOUT',
        });
      }
    };

    setTimeout(checkState, intervalMs);
  });
}

export async function retryBridge(
  result: any,
  context?: any
): Promise<any> {
  try {
    console.log('Retrying bridge...');

    const retryResult = await bridgeKit.retry(
      result,
      context
    );

    console.log(`Retry result state: ${retryResult.state}`);

    return retryResult;
  } catch (error: any) {
    console.error(
      'Retry failed:',
      error.message
    );

    throw error;
  }
}