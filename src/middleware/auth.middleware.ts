import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const auth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('x-auth-token');

  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      _id: string;
      isGuest: boolean;
    };

    req.userId = decoded._id;
    req.isGuest = decoded.isGuest;
    next();
  } catch (error) {
    res
      .status(400)
      .json({ message: 'Invalid token', error: (error as Error).message });
  }
};

export default auth;
