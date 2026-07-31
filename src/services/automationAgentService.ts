// src/services/automationAgentService.ts
import prisma from '../lib/prisma';
import { TxStatus } from '@prisma/client';
import { getEthTreasuryWalletId } from './treasuryService';
import { checkUserBalance, getUserWalletId } from './walletService';
import { getActiveRules, shouldExecuteRule, hasPendingTransaction } from './ruleEngineService';
import { shouldPauseTransfer } from './exchangeRateService';
import { requestConfirmation, checkConfirmation } from './notificationService';
import { bridgeArcToEth } from './bridgeKitService';
import { transfiOffRamp } from './transfiService';
import { createTransaction, updateTransactionStatus } from './transactionService';

export class AutomationAgent {
  async runAllRules() {
    console.log('AutomationAgent: Running all rules...');

    const rules = await getActiveRules();
    console.log(`Found ${rules.length} active rules`);

    let executed = 0;
    let skipped = 0;

    for (const rule of rules) {
      try {
        const result = await this.processRule(rule);

        if (result) {
          executed++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Error processing rule ${rule.id}:`, error);
        skipped++;
      }
    }

    console.log(`AutomationAgent completed: ${executed} executed, ${skipped} skipped`);
  }

  private async processRule(rule: any): Promise<boolean> {
    if (!shouldExecuteRule(rule)) {
      return false;
    }

    console.log(`Processing rule: ${rule.name} (ID: ${rule.id})`);

    const hasPending = await hasPendingTransaction(rule.userId, rule.id);

    if (hasPending) {
      console.log(`Rule ${rule.id} already has pending transaction. Skipping.`);
      return false;
    }

    let balanceCheck;

    try {
      balanceCheck = await checkUserBalance(rule.userId, rule.amount);
    } catch (error) {
      console.error(`Balance check failed:`, error);
      return false;
    }

    if (!balanceCheck.sufficient) {
      console.log(`Insufficient balance: ${balanceCheck.balance} < ${rule.amount}`);
      return false;
    }

    const targetCurr = rule.currency || 'IDR';
    const rateCheck = await shouldPauseTransfer(rule.amount, targetCurr, 20);

    if (rateCheck.pause) {
      console.log(`Exchange rate dropped significantly: ${rateCheck.message}`);

      const transaction = await createTransaction({
        userId: rule.userId,
        ruleId: rule.id,
        type: 'REMITTANCE',
        currency: targetCurr,
        amount: rule.amount,
        usdcAmount: rule.amount,
        status: 'WAITING_CONFIRMATION' as any,
      });

      const confirmation = await requestConfirmation({
        userId: rule.userId,
        transactionId: transaction.id,
        ruleId: rule.id,
        amountUSDC: rule.amount,
        recipientName: rule.recipient?.name || 'Unknown',
        idrAmount: rule.amount * (rateCheck.rate || 15500),
        rate: rateCheck.rate || 15500,
        message: rateCheck.message || 'Exchange rate fluctuation detected',
      });

      console.log(`Waiting for confirmation...`);

      const confirmed = await checkConfirmation(
        confirmation.confirmationId
      );

      if (!confirmed) {
        console.log(`Transfer cancelled by user (no confirmation)`);
        await updateTransactionStatus(transaction.id, 'FAILED');
        return false;
      }

      await updateTransactionStatus(transaction.id, 'PENDING');

      console.log(`Transfer confirmed by user`);
    }

    await this.executeTransfer(rule);

    return true;
  }

  private async executeTransfer(rule: any) {
    console.log(`Executing transfer for rule: ${rule.name}`);

    const user = rule.user;
    const recipient = rule.recipient;
    const targetCurr = rule.currency || 'IDR';

    if (!recipient) {
      console.log(`No recipient for rule ${rule.id}`);
      return;
    }

    const transaction = await createTransaction({
      userId: user.id,
      ruleId: rule.id,
      type: 'REMITTANCE',
      currency: targetCurr,
      amount: rule.amount,
      usdcAmount: rule.amount,
      status: 'PROCESSING' as any,
    });

    try {
      const sourceWalletId = await getUserWalletId(user.id);
      const treasuryWalletId = getEthTreasuryWalletId();

      const bridgeResult = await bridgeArcToEth({
        sourceWalletId,
        destinationWalletId: treasuryWalletId,
        amountUSDC: rule.amount,
      });

      if (bridgeResult.state !== 'success') {
        console.log(`Bridge failed: ${bridgeResult.state}`);
        await updateTransactionStatus(transaction.id, 'FAILED');
        return;
      }

      await updateTransactionStatus(
        transaction.id,
        'PROCESSING' as any,
        bridgeResult.transactionId
      );

      await transfiOffRamp({
        amountUSDC: rule.amount,
        destination: {
          bankName: recipient.bankName || 'BCA',
          accountNumber: recipient.bankAccount || '123456789',
          accountName: recipient.name,
        },
      });

      await updateTransactionStatus(transaction.id, 'SUCCESS');

      await prisma.automationRule.update({
        where: { id: rule.id },
        data: { lastExecutedAt: new Date() },
      });

      console.log(`Transfer completed! Transaction ID: ${transaction.id}`);
      console.log(`${rule.amount} USDC → Target to ${recipient.name}`);

    } catch (error) {
      console.error(`Transfer execution failed for rule ${rule.id}:`, error);
      await updateTransactionStatus(transaction.id, 'FAILED');
    }
  }

  async manualTransfer(params: {
    userId: string;
    ruleId: string;
    force?: boolean;
  }) {
    const { userId, ruleId, force } = params;

    console.log(
      `AutomationAgent: Manual transfer requested (User: ${userId}, Rule: ${ruleId})`
    );

    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId },
      include: {
        user: { include: { wallet: true } },
        recipient: true,
      },
    });

    if (!rule) {
      throw new Error('Rule not found');
    }

    if (rule.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (!force && !shouldExecuteRule(rule)) {
      throw new Error('Rule is not due for execution yet');
    }

    await this.processRule(rule);
  }
}

export const automationAgent = new AutomationAgent();