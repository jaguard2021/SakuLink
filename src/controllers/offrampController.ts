import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { transfiOffRamp } from '../services/transfiService';

export async function initiateOfframp(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.userId; // ✅ langsung ambil dari req.userId
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Logika offramp khusus diletakkan di sini ke depannya
    res.status(200).json({
      success: true,
      message: 'Offramp controller ready',
    });
  } catch (error: any) {
    console.error('Initiate Offramp Error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
}