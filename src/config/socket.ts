import dotenv from 'dotenv';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { chatService } from '../services/chat';

dotenv.config();

interface UserSocket {
  userId: string;
  socketId: string;
}

interface TypingStatus {
  userId: string;
  sessionId: string;
  isTyping: boolean;
  timestamp: number;
}

class SocketService {
  private io: Server | null = null;
  private userSockets: UserSocket[] = [];
  private typingUsers: TypingStatus[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

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

        // Remove typing indicator when user leaves
        this.removeTypingUser(socket.data.userId, sessionId);
      });

      // Handle typing indicator (from human user only)
      socket.on(
        'typing',
        ({ sessionId, isTyping }: { sessionId: string; isTyping: boolean }) => {
          const userId = socket.data.userId;

          if (isTyping) {
            this.addTypingUser(userId, sessionId);
          } else {
            this.removeTypingUser(userId, sessionId);
          }

          // We could emit something to indicate that the user is typing
          // but since there's only an AI on the other end, it might not be necessary
          // We'll keep this for potential future use or if we want to show this in the UI
          this.io?.to(`chat:${sessionId}`).emit('user_typing', {
            sessionId,
            isTyping,
          });
        }
      );

      // Handle message read (when user has read an AI message)
      socket.on(
        'message_read',
        async ({
          sessionId,
          messageId,
        }: {
          sessionId: string;
          messageId: string;
        }) => {
          // Update message status in database
          try {
            await chatService.markMessageAsRead(messageId);

            // Emit read status to all clients in the session (for UI updates)
            this.io?.to(`chat:${sessionId}`).emit('message_read_status', {
              messageId,
            });
          } catch (error) {
            console.error('Error marking message as read:', error);
          }
        }
      );

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.data.userId}`);

        // Remove user from all typing indicators
        [...socket.rooms]
          .filter((room) => room.startsWith('chat:'))
          .forEach((room) => {
            const sessionId = room.replace('chat:', '');
            this.removeTypingUser(socket.data.userId, sessionId);
          });

        this.userSockets = this.userSockets.filter(
          (user) => user.socketId !== socket.id
        );
      });
    });

    console.log('Socket.IO initialized');

    // Periodically clean up stale typing indicators (inactive for more than 10 seconds)
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 10000; // 10 seconds

      const staleTypingUsers = this.typingUsers.filter(
        (user) => now - user.timestamp > staleThreshold
      );

      staleTypingUsers.forEach((user) => {
        this.removeTypingUser(user.userId, user.sessionId);
        this.io?.to(`chat:${user.sessionId}`).emit('user_typing', {
          sessionId: user.sessionId,
          isTyping: false,
        });
      });
    }, 10000);
  }

  /**
   * Clean up resources when shutting down
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }
  }

  /**
   * Add a user to the typing users list
   * @param userId User ID
   * @param sessionId Chat session ID
   */
  private addTypingUser(userId: string, sessionId: string) {
    // Remove existing entry if any
    this.removeTypingUser(userId, sessionId);

    // Add new typing status
    this.typingUsers.push({
      userId,
      sessionId,
      isTyping: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Remove a user from the typing users list
   * @param userId User ID
   * @param sessionId Chat session ID
   */
  private removeTypingUser(userId: string, sessionId: string) {
    this.typingUsers = this.typingUsers.filter(
      (user) => !(user.userId === userId && user.sessionId === sessionId)
    );
  }

  /**
   * Check if the user is typing in a chat session
   * @param sessionId Chat session ID
   * @returns Boolean indicating if the user is typing
   */
  isUserTyping(sessionId: string): boolean {
    return this.typingUsers.some(
      (user) => user.sessionId === sessionId && user.isTyping
    );
  }

  /**
   * Emit a message to all sockets in a chat session
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

  /**
   * Check if a user is online
   * @param userId User ID
   * @returns Boolean indicating if the user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.some((socket) => socket.userId === userId);
  }

  /**
   * Send a typing indicator that the AI is generating a response
   * @param sessionId Chat session ID
   * @param isTyping Whether the AI is typing
   */
  setAITypingStatus(sessionId: string, isTyping: boolean): void {
    if (!this.io) {
      console.warn('Socket.IO not initialized');
      return;
    }

    this.io.to(`chat:${sessionId}`).emit('ai_typing', {
      sessionId,
      isTyping,
    });
  }
}

export const socketService = new SocketService();
