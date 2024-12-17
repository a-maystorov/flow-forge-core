import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import User from '../models/user.model';
import { asyncHandler } from '../utils/asyncHandler';
import { BadRequestError } from '../utils/errors';

const router = express.Router();

const userLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    try {
      const parsedData = userLoginSchema.parse(req.body);
      const { email, password } = parsedData;

      const user = await User.findOne({ email });

      if (!user) {
        throw new BadRequestError('Invalid email or password');
      }

      const isMatch = await bcrypt.compare(password, user.password!);

      if (!isMatch) {
        throw new BadRequestError('Invalid email or password');
      }

      const token = user.generateAuthToken();

      res
        .header('x-auth-token', token)
        .header('access-control-expose-headers', 'x-auth-token')
        .status(200)
        .json({ token });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestError(error.errors[0].message);
      } else {
        throw error;
      }
    }
  })
);

export default router;
