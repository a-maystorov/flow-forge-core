import dotenv from 'dotenv';
import express from 'express';
// Only importing for type information, not for runtime
import { join } from 'path';
import type {} from '../@types/express';
import corsMiddleware from './config/cors';
import { connectDB } from './config/database';
import { errorHandler } from './middleware';
import authRoutes from './routes/auth.routes';
import boardRoutes from './routes/board.routes';
import userRoutes from './routes/user.routes';
import { Server } from 'socket.io';
import { createServer } from 'http';
import chatService from './services/chat.service';
import mongoose from 'mongoose';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(corsMiddleware);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);

app.get('/chat-test', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('chat message', async (msg) => {
    const chatId = '66610a87b983f79ff5a71bb6'; // replace with actual or mock chatId
    const userId = new mongoose.Types.ObjectId('66610a87b983f79ff5a71bb6'); // replace with actual or mock userId

    // 1. Emit the user's message back to the chat
    socket.emit('chat message', JSON.stringify({ from: 'User', message: msg }));

    // 2. Emit loading message
    const loadingMsgId = Date.now().toString(); // Unique ID for identifying and replacing later
    socket.emit(
      'chat message',
      JSON.stringify({
        from: 'AI Assistant',
        loading: true,
        id: loadingMsgId,
        message: 'Thinking...',
      })
    );

    try {
      const result = await chatService.processUserMessage(chatId, userId, msg);

      // 3. Send AI response (optionally include the loadingMsgId if you want to replace it in UI)
      socket.emit(
        'chat message',
        JSON.stringify(
          {
            from: 'AI Assistant',
            id: loadingMsgId,
            action: result.action,
            message: result.message.content,
            data: result.result,
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error('AI error:', err);
      socket.emit(
        'chat message',
        JSON.stringify({
          from: 'AI Assistant',
          error: 'Something went wrong while processing your message.',
        })
      );
    }
  });
});

app.get('/', async (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV });
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

export default app;
