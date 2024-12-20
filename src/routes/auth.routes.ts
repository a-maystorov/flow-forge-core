import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import User from '../models/user.model';
import Board from '../models/board.model';
import { asyncHandler } from '../utils/asyncHandler';
import { BadRequestError, NotFoundError } from '../utils/errors';

const router = express.Router();

const userLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const userRegistrationSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  username: z.string().optional(),
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsedData = userLoginSchema.parse(req.body);
    const { email, password } = parsedData;

    const user = await User.findOne({ email });

    if (!user) {
      throw new BadRequestError('Invalid email or password');
    }

    if (user.isGuest) {
      throw new BadRequestError('Guest users cannot log in with a password.');
    }

    const isMatch = await bcrypt.compare(password, user.password!);

    if (!isMatch) {
      throw new BadRequestError('Invalid email or password');
    }

    const token = user.generateAuthToken();

    res.json({
      token,
      isGuest: false,
    });
  })
);

router.post(
  '/guest-session',
  asyncHandler(async (req, res) => {
    await User.cleanupExpiredGuests();

    const guestUser = new User({
      isGuest: true,
      guestExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });

    await guestUser.save();
    const token = guestUser.generateAuthToken();

    res.status(201).json({
      token,
      isGuest: true,
      expiresAt: guestUser.guestExpiresAt,
      message: 'Guest session created successfully',
    });
  })
);

router.post(
  '/convert-to-user',
  auth,
  asyncHandler(async (req, res) => {
    const { email, password, username } = userRegistrationSchema.parse(
      req.body
    );

    const user = await User.findById(req.userId);
    if (!user || !user.isGuest) {
      throw new BadRequestError(
        'Only guest users can be converted to regular users'
      );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }

    await user.convertToRegisteredUser(email, password);
    if (username) {
      user.username = username;
    }
    await user.save();

    const token = user.generateAuthToken();

    res.json({
      token,
      isGuest: false,
      message: 'Successfully converted to registered user',
    });
  })
);

router.post(
  '/guest-logout',
  auth,
  asyncHandler(async (req, res) => {
    if (!req.isGuest) {
      throw new BadRequestError('This endpoint is only for guest users');
    }

    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await Board.deleteMany({ ownerId: req.userId });

    await user.deleteOne();

    res.status(200).json({
      message: 'Guest session ended and data cleaned up successfully',
    });
  })
);

export default router;
