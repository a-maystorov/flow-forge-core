import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Middleware to validate request using Zod schemas
 * @param schema Zod schema to validate against
 * @returns Express middleware function
 */
export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request against schema
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Replace request properties with validated data
      req.body = result.body || req.body;
      req.query = result.query || req.query;
      req.params = result.params || req.params;

      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errorMessages,
        });
      } else {
        // Pass other errors to the error handler
        next(error);
      }
    }
  };
};

export default validateRequest;
