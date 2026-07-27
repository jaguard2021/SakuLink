import prisma from '../lib/prisma';

export async function getActiveRules() {
  return await prisma.automationRule.findMany({
    where: { active: true },
    include: {
      user: { include: { wallet: true } },
      recipient: true,
    },
  });
}

export function shouldExecuteRule(rule: any): boolean {
  if (!rule.lastExecutedAt) {
    return true;
  }

  const now = new Date();
  const lastExecuted = new Date(rule.lastExecutedAt);
  const schedule = rule.schedule;

  switch (schedule) {
    case 'MONTHLY': {
      const daysDiff =
        (now.getTime() - lastExecuted.getTime()) /
        (1000 * 60 * 60 * 24);

      return daysDiff >= 30;
    }

    case 'WEEKLY': {
      const hoursDiff =
        (now.getTime() - lastExecuted.getTime()) /
        (1000 * 60 * 60);

      return hoursDiff >= 168;
    }

    case 'EVERY_30_DAYS': {
      const daysDiff30 =
        (now.getTime() - lastExecuted.getTime()) /
        (1000 * 60 * 60 * 24);

      return daysDiff30 >= 30;
    }

    default: {
      const hoursDiffDefault =
        (now.getTime() - lastExecuted.getTime()) /
        (1000 * 60 * 60);

      return hoursDiffDefault >= 24;
    }
  }
}

export async function hasPendingTransaction(
  userId: string,
  ruleId: string
) {
  const pending = await prisma.transaction.findFirst({
    where: {
      userId,
      ruleId,
      type: 'REMITTANCE',
      status: {
        in: [
          'PENDING',
          'PROCESSING',
          'WAITING_CONFIRMATION',
        ] as any,
      },
    },
  });

  return !!pending;
}