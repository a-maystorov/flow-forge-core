import { Types } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      userId?: string | Types.ObjectId;
      isGuest?: boolean;
    }
  }
}

// This file needs to be a module for global augmentation to work
export {};
