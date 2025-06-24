import dotenv from 'dotenv';
import express from 'express';
// Only importing for type information, not for runtime
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { join } from 'path';
import { Server } from 'socket.io';
import type {} from '../@types/express';
import corsMiddleware from './config/cors';
import { connectDB } from './config/database';
import { errorHandler } from './middleware';
import Chat from './models/chat.model';
import authRoutes from './routes/auth.routes';
import boardContextRoutes from './routes/board-context.routes';
import boardRoutes from './routes/board.routes';
import chatRoutes from './routes/chat.routes';
import userRoutes from './routes/user.routes';
import chatService from './services/chat.service';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(corsMiddleware);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/board-context', boardContextRoutes);

app.get('/chat-test', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

const socketChatMap = new Map<string, mongoose.Types.ObjectId>();
const socketUserMap = new Map<string, mongoose.Types.ObjectId>();

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth.token || socket.handshake.headers['x-auth-token'];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      _id: string;
    };

    if (!decoded._id) {
      return next(new Error('Invalid authentication token'));
    }

    const userId = new mongoose.Types.ObjectId(decoded._id);
    socketUserMap.set(socket.id, userId);
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  const userId = socketUserMap.get(socket.id);

  if (!userId) {
    console.error('No authenticated userId found for socket:', socket.id);
    socket.disconnect(true);
    return;
  }

  socket.on('new chat', async (title = 'New Chat') => {
    try {
      const newChat = await chatService.createChat(userId, title);

      socketChatMap.set(socket.id, newChat._id);

      socket.emit('chat created', {
        _id: newChat._id.toString(),
        title: newChat.title,
        createdAt: newChat.createdAt,
      });

      socket.join(newChat._id.toString());
    } catch (err) {
      console.error('Error creating chat:', err);
      socket.emit('error', { message: 'Failed to create chat' });
    }
  });

  socket.on('new chat from board', async (data) => {
    try {
      if (!data || !data.boardId) {
        socket.emit('error', {
          message: 'BoardId is required to create a chat from board',
        });
        return;
      }

      const title = data.title || 'New Chat';
      const newChat = await chatService.createChat(userId, title, data.boardId);

      socketChatMap.set(socket.id, newChat._id);

      socket.emit('chat created', {
        _id: newChat._id.toString(),
        title: newChat.title,
        createdAt: newChat.createdAt,
        hasBoardContext: true,
      });

      socket.join(newChat._id.toString());
    } catch (err) {
      console.error('Error creating chat from board:', err);
      socket.emit('error', { message: 'Failed to create chat from board' });
    }
  });

  socket.on('select chat', async (chatId) => {
    try {
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      const chat = await Chat.findOne({ _id: chatObjectId, userId });

      if (!chat) {
        return socket.emit('error', { message: 'Chat not found' });
      }

      socketChatMap.set(socket.id, chatObjectId);
      socket.emit('chat selected', {
        chatId: chatObjectId.toString(),
        _id: chatObjectId.toString(),
      });
    } catch (err) {
      console.error('Error selecting chat:', err);
      socket.emit('error', { message: 'Failed to select chat' });
    }
  });

  socket.on('get chats', async () => {
    try {
      const chats = await Chat.find({ userId })
        .sort({ lastMessageAt: -1 })
        .select('_id title createdAt lastMessageAt')
        .exec();

      const chatsWithStringIds = chats.map((chat) => ({
        ...chat.toObject(),
        _id: chat._id.toString(),
      }));

      socket.emit('chats list', chatsWithStringIds);
    } catch (err) {
      console.error('Error getting chats:', err);
      socket.emit('error', { message: 'Failed to get chats list' });
    }
  });

  socket.on('chat message', async (msgData) => {
    try {
      const messageText = typeof msgData === 'string' ? msgData : msgData.text;

      const chatId = socketChatMap.get(socket.id);

      if (!chatId) {
        const newChat = await chatService.createChat(userId, 'New Chat');
        socketChatMap.set(socket.id, newChat._id);

        socket.emit('chat created', {
          _id: newChat._id.toString(),
          chatId: newChat._id.toString(),
          title: newChat.title,
          createdAt: newChat.createdAt,
        });
      }

      const currentChatId = socketChatMap.get(socket.id)!;

      io.to(currentChatId.toString()).emit('chat message', {
        from: 'user',
        content: messageText,
        chatId: currentChatId.toString(),
      });

      const normalizedUserId = new mongoose.Types.ObjectId(userId);

      const result = await chatService.processUserMessage(
        currentChatId,
        normalizedUserId,
        messageText
      );

      socket.emit(
        'chat message',
        JSON.stringify(
          {
            chatId: currentChatId.toString(),
            from: 'AI Assistant',
            id: Date.now().toString(),
            action: result.action,
            message: result.message.content,
            boardContext: result.boardContext,
            data: result.result,
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error('AI error:', err);
      const errorChatId = socketChatMap.get(socket.id)?.toString() || 'unknown';
      socket.emit(
        'chat message',
        JSON.stringify({
          chatId: errorChatId,
          from: 'AI Assistant',
          error: 'Something went wrong while processing your message.',
        })
      );
    }
  });

  socket.on('disconnect', () => {
    socketChatMap.delete(socket.id);
    socketUserMap.delete(socket.id);
  });
});

app.get('/', async (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

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
