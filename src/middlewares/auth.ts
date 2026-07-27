import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'sakulink-super-secret-key';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No token provided',
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    ) as {
      userId: string;
      email: string;
      fullName: string;
    };

    req.userId = decoded.userId;
    req.userEmail = decoded.email;

    next();

  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid token',
    });
  }
};