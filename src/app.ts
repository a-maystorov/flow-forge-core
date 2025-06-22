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

// Map to store the currently selected chat ID for each socket connection
const socketChatMap = new Map<string, mongoose.Types.ObjectId>();
// Map to store the authenticated userId for each socket
const socketUserMap = new Map<string, mongoose.Types.ObjectId>();

// Socket.IO middleware for authentication
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth.token || socket.handshake.headers['x-auth-token'];

    if (!token) {
      console.log('No auth token provided for socket connection');
      return next(new Error('Authentication required'));
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      _id: string;
    };

    if (!decoded._id) {
      return next(new Error('Invalid authentication token'));
    }

    // Store the userId in the socket map
    const userId = new mongoose.Types.ObjectId(decoded._id);
    socketUserMap.set(socket.id, userId);
    console.log('Authenticated socket connection for user:', userId.toString());
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  // Get the authenticated user ID from the socket map
  const userId = socketUserMap.get(socket.id);

  if (!userId) {
    console.error('No authenticated userId found for socket:', socket.id);
    socket.disconnect(true);
    return;
  }

  // Event for creating a new chat
  socket.on('new chat', async (title = 'New Chat') => {
    try {
      console.log('Creating new chat');
      const newChat = await chatService.createChat(userId, title);

      // Store the new chat ID in the socket mapping
      socketChatMap.set(socket.id, newChat._id);

      // Emit the chat created event
      socket.emit('chat created', {
        _id: newChat._id.toString(),
        title: newChat.title,
        createdAt: newChat.createdAt,
      });

      // Join the chat room
      socket.join(newChat._id.toString());
    } catch (err) {
      console.error('Error creating chat:', err);
      socket.emit('error', { message: 'Failed to create chat' });
    }
  });

  // Event for creating a new chat from a board
  socket.on('new chat from board', async (data) => {
    try {
      if (!data || !data.boardId) {
        socket.emit('error', {
          message: 'BoardId is required to create a chat from board',
        });
        return;
      }

      console.log(`Creating new chat from board: ${data.boardId}`);
      const title = data.title || 'New Chat';
      const newChat = await chatService.createChat(userId, title, data.boardId);

      // Store the new chat ID in the socket mapping
      socketChatMap.set(socket.id, newChat._id);

      // Emit the chat created event
      socket.emit('chat created', {
        _id: newChat._id.toString(),
        title: newChat.title,
        createdAt: newChat.createdAt,
        hasBoardContext: true,
      });

      // Join the chat room
      socket.join(newChat._id.toString());
    } catch (err) {
      console.error('Error creating chat from board:', err);
      socket.emit('error', { message: 'Failed to create chat from board' });
    }
  });

  // Event for selecting an existing chat
  socket.on('select chat', async (chatId) => {
    try {
      console.log('Selecting chat with ID:', chatId);

      // Convert chatId to ObjectId if it's a string
      const chatObjectId =
        typeof chatId === 'string'
          ? new mongoose.Types.ObjectId(chatId)
          : chatId;

      console.log('Converted to ObjectId:', chatObjectId);

      // Check if the chat exists and belongs to the user
      const chat = await Chat.findOne({ _id: chatObjectId, userId });
      console.log('Found chat:', chat ? 'Yes' : 'No');

      if (!chat) {
        return socket.emit('error', { message: 'Chat not found' });
      }

      // Set this as the currently selected chat
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

  // Event for getting all chats for the current user
  socket.on('get chats', async () => {
    try {
      const chats = await Chat.find({ userId })
        .sort({ lastMessageAt: -1 })
        .select('_id title createdAt lastMessageAt')
        .exec();

      // Convert the ObjectIds to strings for consistent handling on the client
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
      // Handle both string messages and object messages with text property
      const messageText = typeof msgData === 'string' ? msgData : msgData.text;

      // Get the currently selected chat ID for this socket connection
      const chatId = socketChatMap.get(socket.id);

      // If no chat is selected, create a new one
      if (!chatId) {
        console.log('No chat selected, creating a new one');
        const newChat = await chatService.createChat(userId, 'New Chat');
        socketChatMap.set(socket.id, newChat._id);

        // Inform client about the new chat
        socket.emit('chat created', {
          _id: newChat._id.toString(),
          chatId: newChat._id.toString(),
          title: newChat.title,
          createdAt: newChat.createdAt,
        });
      }

      // 1. Emit the user's message back to the chat
      // Get the current chat ID (we know it exists at this point)
      const currentChatId = socketChatMap.get(socket.id)!;

      // Send back the user message to all clients in this chat
      io.to(currentChatId.toString()).emit('chat message', {
        from: 'user',
        content: messageText,
        chatId: currentChatId.toString(),
      });

      // 2. Process the message with AI and get a response
      const normalizedUserId = new mongoose.Types.ObjectId(userId);

      // Process the message with AI and get a response
      const result = await chatService.processUserMessage(
        currentChatId,
        normalizedUserId,
        messageText
      );

      // Log the board context to the console for debugging
      if (result.boardContext) {
        console.log(
          'Board Context:',
          JSON.stringify(result.boardContext, null, 2)
        );
      }

      // 3. Send AI response with board context if available
      socket.emit(
        'chat message',
        JSON.stringify(
          {
            chatId: currentChatId.toString(), // Include the chat ID with the message
            from: 'AI Assistant',
            id: Date.now().toString(), // Generate a unique ID for this message
            action: result.action,
            message: result.message.content,
            boardContext: result.boardContext, // Include the board context
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
          chatId: errorChatId, // Include chat ID even with errors
          from: 'AI Assistant',
          error: 'Something went wrong while processing your message.',
        })
      );
    }
  });

  // Clean up when socket disconnects
  socket.on('disconnect', () => {
    socketChatMap.delete(socket.id);
    socketUserMap.delete(socket.id);
    console.log('Socket disconnected, cleaned up maps');
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
