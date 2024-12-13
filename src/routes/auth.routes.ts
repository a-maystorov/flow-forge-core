import bcrypt from 'bcrypt';
import express from 'express';
import { z } from 'zod';
import User from '../models/user.model';

const router = express.Router();

const userLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

router.post('/login', async (req, res) => {
  try {
    const parsedData = userLoginSchema.parse(req.body);
    const { email, password } = parsedData;

    const user = await User.findOne({ email });

    if (!user) {
      res.status(400).json({ message: 'Invalid credentials' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password!);

    if (!isMatch) {
      res.status(400).json({ message: 'Invalid credentials' });
      return;
    }

    const token = user.generateAuthToken();

    res
      .header('x-auth-token', token)
      .header('access-control-expose-headers', 'x-auth-token')
      .status(200)
      .json({ token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ errors: error.errors });
    } else {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

export default router;
