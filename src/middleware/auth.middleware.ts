import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';

const auth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('x-auth-token');

  try {
    if (!token) {
      const guestUser = new User({ isGuest: true });
      await guestUser.save();

      const token = guestUser.generateAuthToken();
      res.setHeader('x-auth-token', token);

      req.userId = guestUser._id;
      req.isGuest = true;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      _id: string;
      isGuest: boolean;
      exp: number;
    };

    await User.findByIdAndUpdate(decoded._id, {
      lastActive: new Date(),
    });

    req.userId = decoded._id;
    req.isGuest = decoded.isGuest;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        message: 'Session expired',
        isGuest: true,
      });
    } else {
      res.status(400).json({
        message: 'Invalid token',
        error: (error as Error).message,
      });
    }
  }
};

export default auth;
