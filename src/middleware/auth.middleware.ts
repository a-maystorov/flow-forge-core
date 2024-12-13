import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';

const auth = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('x-auth-token');

  try {
    if (!token) {
      const guestUser = new User({ isGuest: true });
      await guestUser.save();

      const guestToken = guestUser.generateAuthToken();
      res.setHeader('x-guest-token', guestToken);

      req.userId = guestUser._id;
      req.isGuest = true;

      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      _id: string;
      isGuest: boolean;
    };

    req.userId = decoded._id;
    req.isGuest = decoded.isGuest;

    next();
  } catch (error) {
    res.status(400).json({
      message: 'Invalid token',
      error: (error as Error).message,
    });
  }
};

export default auth;
