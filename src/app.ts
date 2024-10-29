import dotenv from 'dotenv';
import express from 'express';
import { connectDB } from './config/database';
import boardRoutes from './routes/board.routes';
import userRoutes from './routes/user.routes';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/boards', boardRoutes);

app.get('/', (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
