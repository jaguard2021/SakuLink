import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'sakulink-super-secret-key';
const JWT_EXPIRES_IN = '7d';


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


    const existingUser = await prisma.user.findUnique({
      where: { email },
    });


    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
    }


    const hashedPassword = await bcrypt.hash(password, 10);


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


    const wallet = await prisma.wallet.create({
      data: {
        userId: user.id,
        circleWalletId: `wallet-${user.id}-${Date.now()}`,
        address: `0x${Buffer.from(user.id.replace(/-/g, '')).toString('hex').slice(0, 40)}`,
        network: 'ARC-TESTNET',
        token: 'USDC',
        balance: 0,
      },
    });


    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );


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
          createdAt: wallet.createdAt,
        },
        token,
      },
    });

  } catch (error: any) {
    console.error('Register error:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Registration failed',
    });
  }
}


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
      },
    });


    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }


    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );


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
        token,
      },
    });

  } catch (error: any) {
    console.error('Login error:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
}


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
    console.error('Get profile error:', error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}