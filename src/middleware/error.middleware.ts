import { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';

interface ErrorResponse {
  status: string;
  message: string;
  errors?: z.ZodError['errors'];
}

const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      status: 'error',
      message: err.message,
    };
    res.status(err.statusCode).json(response);
    return;
  }

  if (err instanceof z.ZodError) {
    const response: ErrorResponse = {
      status: 'error',
      message: 'Validation error',
      errors: err.errors,
    };
    res.status(400).json(response);
    return;
  }

  console.error('Unexpected error:', err);

  const response: ErrorResponse = {
    status: 'error',
    message: 'Internal server error',
  };
  res.status(500).json(response);
};

export default errorHandler;
