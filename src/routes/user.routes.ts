import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import { auth } from '../middleware';
import User from '../models/user.model';
import { asyncHandler } from '../utils/asyncHandler';
import { BadRequestError, NotFoundError } from '../utils/errors';

const router = express.Router();

const userSignupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const usernameUpdateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
});

router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const parsedData = userSignupSchema.parse(req.body);
    const { username, email, password } = parsedData;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      password: hashedPassword,
    });

    await user.save();
    const token = user.generateAuthToken();

    res
      .header('x-auth-token', token)
      .header('access-control-expose-headers', 'x-auth-token')
      .status(201)
      .json({
        _id: user._id,
        username: user.username,
        email: user.email,
      });
  })
);

router.put(
  '/username',
  auth,
  asyncHandler(async (req, res) => {
    const { username } = usernameUpdateSchema.parse(req.body);

    const existingUser = await User.findOne({
      username,
      _id: { $ne: req.userId },
    });
    if (existingUser) {
      throw new BadRequestError('Username already taken');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.username = username;
    await user.save();
    const token = user.generateAuthToken();

    res
      .header('x-auth-token', token)
      .header('access-control-expose-headers', 'x-auth-token')
      .status(200)
      .json({
        message: 'Username updated successfully',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
        },
      });
  })
);

export default router;
