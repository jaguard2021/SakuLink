// src/controllers/authController.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { createCircleWallet } from '../services/circleService';
import { createRecipientAddress } from '../services/circleMintService';

const JWT_SECRET = process.env.JWT_SECRET || 'sakulink-super-secret-key';
const JWT_EXPIRES_IN = '7d';

// ============================================================
// 📝 REGISTER – Membuat user, wallet SCA, recipient address, dan fiatAccount
// ============================================================
export async function register(req: Request, res: Response) {
  try {
    const {
      fullName,
      email,
      password,
      country,
      identityType,
      identityNumber,
      phone,
      phoneCode,
      gender,
      street,
      city,
      state,
      postalCode,
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Full name, email, and password are required',
      });
    }

    // Cek email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user di database
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        password: hashedPassword,
        country: country || 'Singapore',
        identityType: identityType || 'PASSPORT',
        identityNumber: identityNumber || null,
        phone: phone || null,
        phoneCode: phoneCode || null,
        gender: gender || null,
        street: street || null,
        city: city || null,
        state: state || null,
        postalCode: postalCode || null,
      },
    });

    // ============================================================
    // 1️⃣ BUAT WALLET SCA DI CIRCLE (Programmable Wallets)
    // ============================================================
    let circleWalletId: string;
    let walletAddress: string;

    try {
      const circleWalletData = await createCircleWallet(user.id, user.email);

      if (!circleWalletData.walletInfo) {
        throw new Error('Circle wallet creation returned no walletInfo');
      }

      circleWalletId = circleWalletData.walletInfo.circleWalletId;
      walletAddress = circleWalletData.walletInfo.address;
    } catch (circleError: any) {
      console.error('❌ Failed to create Circle wallet:', circleError.message);
      // Rollback user jika wallet gagal dibuat
      await prisma.user.delete({ where: { id: user.id } });
      throw new Error(`Failed to create blockchain wallet: ${circleError.message}`);
    }

    // Simpan wallet ke database
    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        circleWalletId: circleWalletId,
        address: walletAddress,
        network: 'ARC-TESTNET',
        token: 'USDC',
        balance: 0,
      },
    });

    // ============================================================
    // 2️⃣ DAFTARKAN WALLET ADDRESS SEBAGAI RECIPIENT DI CIRCLE MINT
    // ============================================================
    let recipientAddressId: string | null = null;

    try {
      const idempotencyKey = uuidv4();
      const recipient = await createRecipientAddress({
        idempotencyKey,
        address: walletAddress,
        chain: 'ARC',
        description: `${user.fullName} wallet`,
      });

      recipientAddressId = recipient.id;

      // Update wallet dengan recipientAddressId
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { recipientAddressId },
      });

      console.log(`✅ Recipient address registered for user ${user.id}: ${recipientAddressId}`);
    } catch (recipientError: any) {
      console.warn('⚠️ Failed to register recipient address:', recipientError.message);
      // Tidak rollback karena wallet sudah berhasil dibuat
    }

    // ============================================================
    // 3️⃣ BUAT FIAT ACCOUNT UNTUK USER (BARU)
    // ============================================================
    try {
      await prisma.fiatAccount.create({
        data: {
          userId: user.id,
          currency: 'SGD', // default mata uang lokal
          localAmount: 0,
          usdBalance: 0,
        },
      });
      console.log(`✅ FiatAccount created for user ${user.id}`);
    } catch (fiatError: any) {
      console.warn('⚠️ Failed to create FiatAccount:', fiatError.message);
      // Tidak rollback karena fitur lain tetap berjalan
    }

    // ============================================================
    // 4️⃣ BUAT JWT TOKEN
    // ============================================================
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // ============================================================
    // 5️⃣ RESPONSE
    // ============================================================
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          country: user.country,
          identityType: user.identityType,
          identityNumber: user.identityNumber,
          kycStatus: user.kycStatus,
          phone: user.phone,
          phoneCode: user.phoneCode,
          gender: user.gender,
          street: user.street,
          city: user.city,
          state: user.state,
          postalCode: user.postalCode,
          transfiUserId: user.transfiUserId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        wallet: {
          id: wallet.id,
          userId: wallet.userId,
          circleWalletId: wallet.circleWalletId,
          address: wallet.address,
          network: wallet.network,
          token: wallet.token,
          balance: wallet.balance,
          recipientAddressId: recipientAddressId,
          createdAt: wallet.createdAt,
        },
        token,
      },
    });
  } catch (error: any) {
    console.error('❌ Register error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Registration failed',
    });
  }
}

// ============================================================
// 🔐 LOGIN
// ============================================================
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        wallet: true,
        fiatAccount: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          country: user.country,
          identityType: user.identityType,
          identityNumber: user.identityNumber,
          kycStatus: user.kycStatus,
          phone: user.phone,
          phoneCode: user.phoneCode,
          gender: user.gender,
          street: user.street,
          city: user.city,
          state: user.state,
          postalCode: user.postalCode,
          transfiUserId: user.transfiUserId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        wallet: user.wallet,
        fiatAccount: user.fiatAccount,
        token,
      },
    });
  } catch (error: any) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
}

// ============================================================
// 👤 GET PROFILE
// ============================================================
export async function getProfile(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        fiatAccount: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          country: user.country,
          identityType: user.identityType,
          identityNumber: user.identityNumber,
          kycStatus: user.kycStatus,
          phone: user.phone,
          phoneCode: user.phoneCode,
          gender: user.gender,
          street: user.street,
          city: user.city,
          state: user.state,
          postalCode: user.postalCode,
          transfiUserId: user.transfiUserId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        wallet: user.wallet,
        fiatAccount: user.fiatAccount,
      },
    });
  } catch (error: any) {
    console.error('❌ Get profile error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}