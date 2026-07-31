import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
  registerBankAccount,
  getBankInstructions,
  mockDeposit,
  getBalance,
  registerRecipientAddress,
  transferToRecipient,
  getTransferStatusHandler,
  fullFlowTest,
  getMasterWalletIdHandler,
} from '../controllers/circleMintController';

const router = Router();

// Semua route di bawah ini butuh auth
router.use(authenticate);

// 🏦 Bank Account
router.post('/mint/bank', registerBankAccount);
router.get('/mint/bank/:bankAccountId/instructions', getBankInstructions);

// 💰 Deposit & Balance
router.post('/mint/mock-deposit', mockDeposit);
router.get('/mint/balance', getBalance);
router.get('/mint/master-wallet', getMasterWalletIdHandler);

// 📬 Recipient & Transfer
router.post('/mint/recipient', registerRecipientAddress);
router.post('/mint/transfer', transferToRecipient);
router.get('/mint/transfer/:transferId', getTransferStatusHandler);

// 🧪 Full flow test
router.post('/mint/full-test', fullFlowTest);

export default router;