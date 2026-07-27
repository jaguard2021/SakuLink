// src/routes/userRoutes.ts
import { Router } from 'express';
import { register, getProfile, updateProfile } from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Public
router.post('/register', register);

// Protected
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

export default router;