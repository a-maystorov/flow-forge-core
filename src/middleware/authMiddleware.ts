import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
  userId?: string;
}

const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const token = req.header('x-auth-token');
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string;
    };

    req.userId = decoded.userId;

    next();
  } catch (error) {
    res
      .status(400)
      .json({ message: 'Invalid token', error: (error as Error).message });
  }
};

export default authMiddleware;
