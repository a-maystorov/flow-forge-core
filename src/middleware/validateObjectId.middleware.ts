import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

const validateObjectId = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      res.status(404).json({ message: 'Invalid ID' });
      return;
    }
    next();
  };
};

export default validateObjectId;
