import { Router } from 'express';
import {
  requestDeposit,
  getDepositHistory,
} from '../controllers/depositController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.post('/', authenticate, requestDeposit);

router.get('/', authenticate, getDepositHistory);

router.get('/payment-complete', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>SakuLink - Pembayaran Selesai</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px; background-color: #f4f6f8; color: #333;">
        <div style="max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <h2 style="color: #2e7d32; margin-bottom: 15px;">🎉 Pembayaran Berhasil Diproses!</h2>
          <p style="color: #666; line-height: 1.5; margin-bottom: 25px;">
            Terima kasih telah menggunakan SakuLink. Transaksi Anda sedang diselesaikan dan saldo akan segera diperbarui.
          </p>
          <p style="font-size: 14px; color: #888;">Silakan tutup halaman ini dan kembali ke aplikasi SakuLink Anda.</p>
        </div>
      </body>
    </html>
  `);
});

export default router;