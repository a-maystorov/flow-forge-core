import dotenv from 'dotenv';
import express from 'express';
import corsMiddleware from './config/cors';
import { connectDB } from './config/database';
import { errorHandler } from './middleware';
import aiRoutes from './routes/ai.routes';
import authRoutes from './routes/auth.routes';
import boardRoutes from './routes/board.routes';
import userRoutes from './routes/user.routes';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(corsMiddleware);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

app.get('/api', (req, res) => {
  res.json({ message: 'CORS is working!' });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
