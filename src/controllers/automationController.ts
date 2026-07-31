// src/controllers/automationController.ts
import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { automationAgent } from '../services/automationAgentService';
import { getWalletBalance } from '../services/circleService';
import { getEthTreasuryWalletId } from '../services/treasuryService';

export const triggerAutomation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const rules = await prisma.automationRule.findMany({
      where: { userId, active: true },
    });

    if (rules.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active rules found',
        data: { rules: 0 },
      });
    }

    // Jalankan di background (tidak blocking)
    setImmediate(() => {
      automationAgent.runAllRules().catch(console.error);
    });

    res.status(200).json({
      success: true,
      message: 'Automation triggered successfully',
      data: { rules: rules.length },
    });
  } catch (error) {
    console.error('Trigger automation error:', error);
    res.status(500).json({ success: false, error: 'Failed to trigger automation' });
  }
};

export const getAutomationStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const rules = await prisma.automationRule.findMany({
      where: { userId },
      include: { recipient: true },
      orderBy: { createdAt: 'desc' },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    let balance = 0;
    if (user?.wallet) {
      const balances = await getWalletBalance(user.wallet.circleWalletId);
      // ✅ Diperbaiki: Circle SDK mengembalikan struktur token dengan symbol
      const usdc = balances.find((b: any) => b.token?.symbol === 'USDC' || b.currency === 'USD' || b.currency === 'USDC');
      balance = usdc ? parseFloat(usdc.amount) : 0;
    }

    const treasuryId = getEthTreasuryWalletId();

    res.status(200).json({
      success: true,
      data: {
        balance,
        treasuryWalletId: treasuryId,
        rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          schedule: r.schedule,
          active: r.active,
          lastExecutedAt: r.lastExecutedAt,
          recipient: r.recipient?.name || 'Unknown',
        })),
        totalRules: rules.length,
        activeRules: rules.filter((r) => r.active).length,
      },
    });
  } catch (error) {
    console.error('Get automation status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
};

export const manualTransfer = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { ruleId, force } = req.body;

    if (!ruleId) {
      return res.status(400).json({ success: false, error: 'ruleId is required' });
    }

    const rule = await prisma.automationRule.findFirst({
      where: { id: ruleId, userId },
    });

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    await automationAgent.manualTransfer({
      userId,
      ruleId,
      force: force || false,
    });

    res.status(200).json({
      success: true,
      message: 'Transfer initiated',
    });
  } catch (error: any) {
    console.error('Manual transfer error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to transfer' });
  }
};