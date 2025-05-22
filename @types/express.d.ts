import { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      userId?: string | JwtPayload | Types.ObjectId;
    }
  }
}

export {};
