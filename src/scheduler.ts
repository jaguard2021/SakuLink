// src/scheduler.ts
import cron from 'node-cron';
import { automationAgent } from './services/automationAgentService';

export function startScheduler() {
  console.log('⏰ Scheduler started!');

  // Jalankan AutomationAgent setiap jam
  cron.schedule('0 * * * *', async () => {
    console.log('⏰ Scheduler: Running AutomationAgent...');
    try {
      await automationAgent.runAllRules();
    } catch (error) {
      console.error('❌ Scheduler error:', error);
    }
  });

  // Opsional: jalankan setiap 5 menit untuk testing
  // cron.schedule('*/5 * * * *', async () => {
  //   console.log('⏰ Scheduler (test mode): Running AutomationAgent...');
  //   await automationAgent.runAllRules();
  // });

  console.log('✅ Scheduler: AutomationAgent will run every hour');
}