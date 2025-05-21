import bcrypt from 'bcrypt';
import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import User from '../models/user.model';
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
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .optional(),
});

// Cleanup expired temporary users on every auth request
router.use(
  asyncHandler(async (req, res, next) => {
    await User.cleanupExpiredUsers();
    next();
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
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

    res.json({
      token,
    });
  })
);

const tempSessionSchema = z.object({
  tempUserId: z.string().optional(),
});

router.post(
  '/temp-session',
  asyncHandler(async (req, res) => {
    const { tempUserId } = tempSessionSchema.parse(req.body);
    let tempUser;
    if (tempUserId) {
      if (mongoose.Types.ObjectId.isValid(tempUserId)) {
        try {
          tempUser = await User.findOne({
            _id: tempUserId,
            expiresAt: { $exists: true, $gt: new Date() },
          });
        } catch (error) {
          console.error('Error finding temporary user:', error);
        }
      }
    }

    if (!tempUser) {
      tempUser = new User({
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      await tempUser.save();
    }

    const token = tempUser.generateAuthToken();

    const isResumedSession =
      tempUserId &&
      mongoose.Types.ObjectId.isValid(tempUserId) &&
      tempUser._id.toString() === tempUserId;

    res.status(201).json({
      token,
      userId: tempUser._id,
      expiresAt: tempUser.expiresAt,
      message: isResumedSession
        ? 'Resumed temporary session. Your previous boards have been restored.'
        : 'Temporary session created. Your boards will be deleted when this session expires.',
    });
  })
);

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password, username } = userRegistrationSchema.parse(
      req.body
    );

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      email,
      password: hashedPassword,
      username,
    });

    await user.save();
    const token = user.generateAuthToken();

    res.status(201).json({
      token,
      message: 'User registered successfully',
    });
  })
);

router.post(
  '/convert-temp-account',
  auth,
  asyncHandler(async (req, res) => {
    const { email, password, username } = userRegistrationSchema.parse(
      req.body
    );

    // Find the temporary user by ID from the auth token
    const user = await User.findById(req.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.email) {
      throw new BadRequestError('This account is already registered');
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new BadRequestError('Email already in use');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.email = email;
    user.password = hashedPassword;
    user.username = username || user.username;
    user.expiresAt = undefined; // Remove expiration date
    await user.save();

    // Generate a new token
    const token = user.generateAuthToken();

    res.status(200).json({
      token,
      message: 'Account successfully converted to a permanent account',
    });
  })
);

export default router;
