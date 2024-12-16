import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import auth from '../middleware/auth.middleware';
import User from '../models/user.model';

const router = express.Router();

const userSignupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const guestConversionSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const usernameUpdateSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long'),
});

router.post('/signup', async (req, res) => {
  try {
    const parsedData = userSignupSchema.parse(req.body);
    const { username, email, password } = parsedData;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user = await User.findOne({ email });

    if (user) {
      res.status(400).json({ message: 'User already exists' });
    } else {
      user = new User({ username, email, password: passwordHash });
      await user.save();

      const token = user.generateAuthToken();
      res
        .header('x-auth-token', token)
        .status(201)
        .json({ _id: user._id, username, email });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.post('/convert-guest', auth, async (req, res) => {
  try {
    if (!req.isGuest) {
      res.status(400).json({
        message: 'Only guest users can convert their account',
      });
    } else {
      const parsedData = guestConversionSchema.parse(req.body);
      const { email, password } = parsedData;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        res.status(400).json({
          message: 'Email already in use',
        });
      } else {
        const user = await User.findById(req.userId);
        if (!user) {
          res.status(404).json({
            message: 'User not found',
          });
        } else {
          const salt = await bcrypt.genSalt(10);
          const passwordHash = await bcrypt.hash(password, salt);

          await user.convertToRegisteredUser(email, passwordHash);

          const token = user.generateAuthToken();

          res
            .header('x-auth-token', token)
            .status(200)
            .json({
              message: 'Successfully converted to registered user',
              user: {
                _id: user._id,
                username: user.username,
                email: user.email,
              },
            });
        }
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

router.put('/username', auth, async (req, res) => {
  try {
    const { username } = usernameUpdateSchema.parse(req.body);

    const existingUser = await User.findOne({
      username,
      _id: { $ne: req.userId },
    });

    if (existingUser) {
      res.status(400).json({
        message: 'Username already taken',
      });
    } else {
      const user = await User.findById(req.userId);
      if (!user) {
        res.status(404).json({
          message: 'User not found',
        });
      } else {
        user.username = username;
        await user.save();

        const token = user.generateAuthToken();

        res
          .header('x-auth-token', token)
          .status(200)
          .json({
            message: 'Username updated successfully',
            user: {
              _id: user._id,
              username: user.username,
              email: user.email,
            },
          });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

export default router;
