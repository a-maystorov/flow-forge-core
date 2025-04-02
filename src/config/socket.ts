import dotenv from 'dotenv';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

dotenv.config();

interface UserSocket {
  userId: string;
  socketId: string;
}

class SocketService {
  private io: Server | null = null;
  private userSockets: UserSocket[] = [];

  initialize(server: http.Server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
          'http://localhost:5173',
          'http://localhost:3000',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
          _id: string;
        };

        socket.data.userId = decoded._id;
        next();
      } catch (error) {
        next(new Error('Authentication error: ' + error));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.data.userId}`);

      // Add user to connected users list
      this.userSockets.push({
        userId: socket.data.userId,
        socketId: socket.id,
      });

      // Join user to their own room for private messages
      socket.join(socket.data.userId);

      // Handle chat join
      socket.on('join_chat', (sessionId: string) => {
        socket.join(`chat:${sessionId}`);
        console.log(`User ${socket.data.userId} joined chat ${sessionId}`);
      });

      // Handle chat leave
      socket.on('leave_chat', (sessionId: string) => {
        socket.leave(`chat:${sessionId}`);
        console.log(`User ${socket.data.userId} left chat ${sessionId}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.data.userId}`);
        this.userSockets = this.userSockets.filter(
          (user) => user.socketId !== socket.id
        );
      });
    });

    console.log('Socket.IO initialized');
  }

  /**
   * Emit a message to all users in a chat session
   * @param sessionId Chat session ID
   * @param event Event name
   * @param data Event data
   */
  emitToChatSession<T>(sessionId: string, event: string, data: T) {
    if (!this.io) {
      console.warn('Socket.IO not initialized');
      return;
    }

    this.io.to(`chat:${sessionId}`).emit(event, data);
  }

  /**
   * Emit a message to a specific user
   * @param userId User ID
   * @param event Event name
   * @param data Event data
   */
  emitToUser<T>(userId: string, event: string, data: T) {
    if (!this.io) {
      console.warn('Socket.IO not initialized');
      return;
    }

    this.io.to(userId).emit(event, data);
  }

  /**
   * Get the socket.io server instance
   * @returns The socket.io server instance
   */
  getIO() {
    return this.io;
  }
}

export const socketService = new SocketService();
