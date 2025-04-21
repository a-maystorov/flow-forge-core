import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import corsMiddleware from './config/cors';
import { connectDB } from './config/database';
import { socketService } from './config/socket';
import { errorHandler } from './middleware';
import aiRoutes from './routes/ai.routes';
import authRoutes from './routes/auth.routes';
import boardRoutes from './routes/board.routes';
import chatRoutes from './routes/chat.routes';
import suggestionRoutes from './routes/suggestion.routes';
import userRoutes from './routes/user.routes';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Only initialize socket in non-test environment or if explicitly requested
// This prevents open handles in tests
if (process.env.NODE_ENV !== 'test') {
  socketService.initialize(server);
}

app.use(express.json());
app.use(corsMiddleware);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/suggestions', suggestionRoutes);

app.get('/', (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

app.get('/api', (req, res) => {
  res.json({ message: 'CORS is working!' });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For testing: Allow explicitly initializing and closing the socket service
export const initializeSocketForTests = () => socketService.initialize(server);
export const shutdownSocketForTests = () => socketService.shutdown();
export const getServerForTests = () => server;

export default app;
