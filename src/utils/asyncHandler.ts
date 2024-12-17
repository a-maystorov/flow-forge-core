import { NextFunction, Request, Response } from 'express';

type AsyncRequestHandler<T = void> = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<T>;

export const asyncHandler = <T>(fn: AsyncRequestHandler<T>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
