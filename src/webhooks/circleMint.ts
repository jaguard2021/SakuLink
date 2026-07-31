// src/webhooks/circleMint.ts
import { Request, Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../lib/prisma';

const CIRCLE_MINT_API_KEY = process.env.CIRCLE_MINT_API_KEY || '';
const BYPASS_SIGNATURE = process.env.CIRCLE_MINT_BYPASS_SIGNATURE === 'true';
console.log("🔍 Circle Mint BYPASS_SIGNATURE:", BYPASS_SIGNATURE);

const certCache = new Map<string, crypto.KeyObject>();
const processedMessageIds = new Set<string>();

interface SNSMessage {
  Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  UnsubscribeURL?: string;
  Token?: string;
}

interface CircleV1Event {
  notificationType: string;
  clientId: string;
  version: number;
  customAttributes?: any;
  deposit?: any;
  transfer?: any;
  payout?: any;
}

function isValidSigningCertURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

function buildSNSStringToSign(snsMessage: SNSMessage): string {
  const { Type, Message, MessageId, SignatureVersion, Timestamp, TopicArn, Token, SubscribeURL } = snsMessage;

  if (Type === 'SubscriptionConfirmation') {
    return (
      `Message\n${Message}\n` +
      `MessageId\n${MessageId}\n` +
      `SubscribeURL\n${SubscribeURL}\n` +
      `Timestamp\n${Timestamp}\n` +
      `Token\n${Token}\n` +
      `Type\n${Type}\n`
    );
  } else if (Type === 'Notification') {
    return (
      `Message\n${Message}\n` +
      `MessageId\n${MessageId}\n` +
      `SignatureVersion\n${SignatureVersion}\n` +
      `Timestamp\n${Timestamp}\n` +
      `TopicArn\n${TopicArn}\n` +
      `Type\n${Type}\n`
    );
  }

  return (
    `Message\n${Message}\n` +
    `MessageId\n${MessageId}\n` +
    `Timestamp\n${Timestamp}\n` +
    `TopicArn\n${TopicArn}\n` +
    `Type\n${Type}\n`
  );
}

async function verifySNSMessage(snsMessage: SNSMessage): Promise<boolean> {
  try {
    if (!isValidSigningCertURL(snsMessage.SigningCertURL)) {
      console.warn('⚠️ Invalid SigningCertURL domain:', snsMessage.SigningCertURL);
      return false;
    }

    const certUrl = snsMessage.SigningCertURL;
    let publicKey = certCache.get(certUrl);
    if (!publicKey) {
      const response = await axios.get(certUrl, { responseType: 'text' });
      const certPem = response.data;
      const cert = new crypto.X509Certificate(certPem);
      publicKey = cert.publicKey;
      certCache.set(certUrl, publicKey);
    }

    const stringToSign = buildSNSStringToSign(snsMessage);
    const signatureBuffer = Buffer.from(snsMessage.Signature, 'base64');
    const algorithm = snsMessage.SignatureVersion === '1' ? 'SHA1' : 'SHA256';
    const verifier = crypto.createVerify(algorithm);
    verifier.update(stringToSign);
    const isValid = verifier.verify(publicKey, signatureBuffer);

    if (!isValid) {
      console.warn('⚠️ SNS signature verification failed');
    }
    return isValid;
  } catch (error: any) {
    console.error('❌ SNS signature verification error:', error.message);
    return false;
  }
}

function isAlreadyProcessed(messageId: string): boolean {
  if (processedMessageIds.has(messageId)) {
    return true;
  }
  if (processedMessageIds.size > 10000) {
    processedMessageIds.clear();
  }
  processedMessageIds.add(messageId);
  return false;
}

export async function handleCircleMintWebhook(req: Request, res: Response) {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // 🔥 DEBUG LOGS
    console.log('🔥 SNS RAW BODY:');
    console.log(rawBody);

    const snsMessage = JSON.parse(rawBody) as SNSMessage;

    console.log('🔥 SigningCertURL:', snsMessage.SigningCertURL);
    console.log(`📨 Circle Mint webhook: Type=${snsMessage.Type}, MessageId=${snsMessage.MessageId}`);

    if (snsMessage.Type === 'SubscriptionConfirmation') {
      if (!BYPASS_SIGNATURE) {
        const isValid = await verifySNSMessage(snsMessage);
        if (!isValid) {
          console.warn('⚠️ Invalid SNS signature for SubscriptionConfirmation – rejecting');
          return res.status(401).json({ error: 'Invalid SNS signature' });
        }
      } else {
        console.log('🔓 Bypassing signature verification for SubscriptionConfirmation (sandbox)');
      }

      if (snsMessage.SubscribeURL) {
        console.log('🔗 Confirming SNS subscription:', snsMessage.SubscribeURL);
        await axios.get(snsMessage.SubscribeURL);
        console.log('✅ Subscription confirmed!');
      }
      return res.sendStatus(200);
    }

    if (snsMessage.Type === 'Notification') {
      if (!BYPASS_SIGNATURE) {
        const isValid = await verifySNSMessage(snsMessage);
        if (!isValid) {
          console.warn('⚠️ Invalid SNS signature – rejecting webhook');
          return res.status(401).json({ error: 'Invalid SNS signature' });
        }
      } else {
        console.log('🔓 Bypassing signature verification for Notification (sandbox)');
      }

      if (isAlreadyProcessed(snsMessage.MessageId)) {
        console.log(`⏭️ Duplicate webhook (${snsMessage.MessageId}) – skipped`);
        return res.sendStatus(200);
      }

      const innerPayload: CircleV1Event = JSON.parse(snsMessage.Message);
      console.log(`📊 Inner event: notificationType=${innerPayload.notificationType}, clientId=${innerPayload.clientId}`);

      await processCircleV1Event(innerPayload);

      return res.sendStatus(200);
    }

    console.log(`ℹ️ Unhandled SNS type: ${snsMessage.Type}`);
    res.sendStatus(200);
  } catch (error: any) {
    console.error('❌ Circle Mint webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

async function processCircleV1Event(event: CircleV1Event) {
  const { notificationType, deposit, transfer, payout } = event;

  switch (notificationType) {
    case 'deposits':
      if (deposit) {
        const status = deposit.status;
        if (status === 'complete' || status === 'completed') {
          console.log(`✅ Wire deposit completed: ${deposit.trackingRef}, amount: ${deposit.amount?.amount} ${deposit.amount?.currency}`);
          await handleDepositCompleted(deposit);
        } else {
          console.log(`⏳ Deposit ${deposit.id} status: ${status}`);
        }
      }
      break;

    case 'transfers':
      if (transfer) {
        const status = transfer.status;
        if (status === 'complete' || status === 'completed') {
          console.log(`✅ Transfer completed: ${transfer.id}, tx: ${transfer.transactionHash}`);
          await handleTransferCompleted(transfer);
        } else if (status === 'failed') {
          console.error(`❌ Transfer failed: ${transfer.id}`);
          await handleFailedEvent(transfer);
        } else {
          console.log(`⏳ Transfer ${transfer.id} status: ${status}`);
        }
      }
      break;

    case 'payouts':
      if (payout) {
        const status = payout.status;
        if (status === 'complete' || status === 'completed') {
          console.log(`✅ Payout completed: ${payout.id}, amount: ${payout.amount?.amount} ${payout.amount?.currency}`);
          await handlePayoutCompleted(payout);
        } else {
          console.log(`⏳ Payout ${payout.id} status: ${status}`);
        }
      }
      break;

    default:
      console.log(`ℹ️ Unhandled notificationType: ${notificationType}`);
  }
}

async function handleDepositCompleted(data: any) {
  const trackingRef = data.trackingRef;
  const amount = data.amount?.amount;

  const transaction = await prisma.transaction.findFirst({
    where: {
      providerOrderId: trackingRef,
      provider: 'CIRCLE_MINT',
    },
  });

  if (transaction) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        usdcAmount: parseFloat(amount),
        circleTxId: data.id,
      },
    });
    console.log(`✅ Transaction ${transaction.id} updated to SUCCESS`);
  } else {
    console.warn(`⚠️ Transaction not found for trackingRef: ${trackingRef}`);
  }
}

async function handleTransferCompleted(data: any) {
  const transferId = data.id;
  const txHash = data.transactionHash;
  const amount = data.amount?.amount;
  const destinationAddress = data.destination?.address;
  const chain = data.destination?.chain;

  const transaction = await prisma.transaction.findFirst({
    where: {
      providerOrderId: transferId,
      provider: 'CIRCLE_MINT',
    },
  });

  if (transaction) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        circleTxId: txHash,
        usdcAmount: parseFloat(amount),
      },
    });
    console.log(`✅ Transfer ${transferId} completed, TX: ${txHash}`);
  } else {
    const treasuryWallet = process.env.TREASURY_WALLET_ADDRESS;
    if (destinationAddress === treasuryWallet) {
      console.log(`💰 Treasury wallet received ${amount} USDC on ${chain}`);
    } else {
      console.log(`💰 Transfer to ${destinationAddress} on ${chain}: ${amount} USDC (TX: ${txHash})`);
    }
  }
}

async function handlePayoutCompleted(data: any) {
  const payoutId = data.id;
  const amount = data.amount?.amount;

  const transaction = await prisma.transaction.findFirst({
    where: {
      providerOrderId: payoutId,
      provider: 'CIRCLE_MINT',
    },
  });

  if (transaction) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        usdcAmount: parseFloat(amount),
      },
    });
    console.log(`✅ Payout ${payoutId} completed, amount: ${amount}`);
  }
}

async function handleFailedEvent(data: any) {
  const id = data.id;

  const transaction = await prisma.transaction.findFirst({
    where: {
      providerOrderId: id,
      provider: 'CIRCLE_MINT',
    },
  });

  if (transaction) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'FAILED',
      },
    });
    console.log(`❌ Transaction ${transaction.id} marked as FAILED`);
  }
}

export async function registerCircleMintWebhook(endpointUrl: string): Promise<any> {
  try {
    const response = await axios.post(
      'https://api-sandbox.circle.com/v1/notifications/subscriptions',
      {
        endpoint: endpointUrl,
      },
      {
        headers: {
          Authorization: `Bearer ${CIRCLE_MINT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅ Circle Mint webhook registered:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Failed to register webhook:', error.response?.data || error.message);
    throw new Error('Failed to register Circle Mint webhook');
  }
}

export async function listCircleMintWebhooks(): Promise<any> {
  try {
    const response = await axios.get(
      'https://api-sandbox.circle.com/v1/notifications/subscriptions',
      {
        headers: {
          Authorization: `Bearer ${CIRCLE_MINT_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('❌ Failed to list webhooks:', error.response?.data || error.message);
    throw new Error('Failed to list Circle Mint webhooks');
  }
}