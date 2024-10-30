import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import User from '../models/user.model';

const router = express.Router();

const userSignupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters long'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
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
      return;
    }

    user = new User({ username, email, password: passwordHash });
    await user.save();

    const token = user.generateAuthToken();
    res
      .header('x-auth-token', token)
      .status(201)
      .json({ _id: user._id, username, email });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

export default router;
