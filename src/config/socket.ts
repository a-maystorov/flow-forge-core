import dotenv from 'dotenv';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import {
  BoardSuggestion,
  TaskBreakdownSuggestion,
  TaskImprovementSuggestion,
} from '../models/suggestion.model';
import { chatService } from '../services/chat';
import { ChatMessageDocument } from '../types/mongoose';

dotenv.config();

interface UserSocket {
  userId: string;
  socketId: string;
}

interface TypingStatus {
  userId: string;
  sessionId: string;
  timestamp: number;
}

/**
 * Suggestion status type
 */
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Type for suggestion preview event data
 */
export type SuggestionPreviewEvent = {
  sessionId: string;
  suggestionId: string;
  type: 'board' | 'task-breakdown' | 'task-improvement';
  preview:
    | BoardSuggestion
    | TaskBreakdownSuggestion
    | TaskImprovementSuggestion;
};

/**
 * Type for suggestion status update event data
 */
export type SuggestionStatusEvent = {
  sessionId: string;
  suggestionId: string;
  status: SuggestionStatus;
};

/**
 * Type for typing status event data
 */
export interface TypingStatusEvent {
  sessionId: string;
  userId: string;
  isTyping: boolean;
}

/**
 * Type for AI typing status event data
 */
export interface AITypingStatusEvent {
  sessionId: string;
  isTyping: boolean;
}

/**
 * Union type for all possible socket event data
 */
export type SocketEventData =
  | SuggestionPreviewEvent
  | SuggestionStatusEvent
  | TypingStatusEvent
  | AITypingStatusEvent
  | ChatMessageDocument
  | { [key: string]: unknown };

class SocketService {
  private io: Server | null = null;
  private userSockets: UserSocket[] = [];
  private typingStatus: Map<string, TypingStatus[]> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the socket server
   * @param httpServer - HTTP server instance
   */
  initialize(httpServer?: http.Server): void {
    if (this.io) {
      console.log('Socket service already initialized');
      return;
    }

    let server = httpServer;

    if (!server) {
      server = http.createServer();
      server.listen(0); // Use port 0 to get any available port
    }

    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://localhost:5173',
      'http://localhost:5174',
    ];

    this.io = new Server(server, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket'],
    });

    // Authentication middleware for socket connections
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: Token not provided'));
      }

      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'default_secret'
        ) as jwt.JwtPayload;

        // Store user ID in socket data for future reference
        socket.data.userId = decoded.userId;
        next();
      } catch (error) {
        console.error('Authentication error:', error);
        return next(new Error('Authentication error: Invalid token'));
      }
    });

    // Handle socket connections
    this.io.on('connection', (socket) => {
      console.log('New client connected', socket.id);

      // Store user socket
      if (socket.data.userId) {
        this.userSockets.push({
          userId: socket.data.userId,
          socketId: socket.id,
        });
      }

      // Join user room for private messages
      if (socket.data.userId) {
        socket.join(`user:${socket.data.userId}`);
      }

      // Join chat session room and other rooms
      socket.on('join_chat', async (sessionId: string) => {
        try {
          // Verify user has access to this chat session
          const session = await chatService.getChatSession(sessionId);

          if (!session) {
            socket.emit('error', {
              message: 'Chat session not found',
            });
            return;
          }

          if (session.userId.toString() !== socket.data.userId) {
            socket.emit('error', {
              message: 'Unauthorized to join this chat session',
            });
            return;
          }

          // Join chat session room
          socket.join(`chat:${sessionId}`);
          console.log(
            `User ${socket.data.userId} joined chat session ${sessionId}`
          );

          // Inform user that join was successful
          socket.emit('chat_joined', {
            sessionId,
            userId: socket.data.userId,
          });
        } catch (error) {
          console.error('Error joining chat:', error);
          socket.emit('error', {
            message: 'Error joining chat session',
          });
        }
      });

      // User typing status
      socket.on(
        'typing_status',
        async ({
          sessionId,
          isTyping,
        }: {
          sessionId: string;
          isTyping: boolean;
        }) => {
          if (!socket.data.userId) return;

          try {
            // Update typing status in memory
            if (isTyping) {
              const sessionTypingStatus =
                this.typingStatus.get(sessionId) || [];

              // See if user is already in the typing status list
              const userIndex = sessionTypingStatus.findIndex(
                (status) => status.userId === socket.data.userId
              );

              if (userIndex >= 0) {
                // Update timestamp
                sessionTypingStatus[userIndex].timestamp = Date.now();
              } else {
                // Add new typing status
                sessionTypingStatus.push({
                  userId: socket.data.userId,
                  sessionId,
                  timestamp: Date.now(),
                });
              }

              this.typingStatus.set(sessionId, sessionTypingStatus);
            } else {
              // Remove user from typing status
              const sessionTypingStatus =
                this.typingStatus.get(sessionId) || [];
              const updatedTypingStatus = sessionTypingStatus.filter(
                (status) => status.userId !== socket.data.userId
              );

              if (updatedTypingStatus.length === 0) {
                this.typingStatus.delete(sessionId);
              } else {
                this.typingStatus.set(sessionId, updatedTypingStatus);
              }
            }

            // Emit typing status to chat room
            this.emitTypingStatus(sessionId, socket.data.userId, isTyping);
          } catch (error) {
            console.error('Error updating typing status:', error);
            socket.emit('error', {
              message: 'Error updating typing status',
            });
          }
        }
      );

      // Handle socket disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);

        // Remove user socket
        this.userSockets = this.userSockets.filter(
          (userSocket) => userSocket.socketId !== socket.id
        );

        // Clear typing status for this user in all sessions
        if (socket.data.userId) {
          this.typingStatus.forEach((sessionTypingStatus, sessionId) => {
            const updatedTypingStatus = sessionTypingStatus.filter(
              (status) => status.userId !== socket.data.userId
            );

            if (updatedTypingStatus.length === 0) {
              this.typingStatus.delete(sessionId);
            } else {
              this.typingStatus.set(sessionId, updatedTypingStatus);
            }

            // Emit typing status update to session
            this.emitTypingStatus(sessionId, socket.data.userId, false);
          });
        }
      });
    });

    // Periodically clean up stale typing indicators (inactive for more than 10 seconds)
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 10000; // 10 seconds

      this.typingStatus.forEach((sessionTypingStatus, sessionId) => {
        const staleStatuses = sessionTypingStatus.filter(
          (status) => now - status.timestamp > staleThreshold
        );

        // Emit typing = false for stale statuses
        staleStatuses.forEach((status) => {
          this.emitTypingStatus(sessionId, status.userId, false);
        });

        // Remove stale statuses
        const updatedTypingStatus = sessionTypingStatus.filter(
          (status) => now - status.timestamp <= staleThreshold
        );

        if (updatedTypingStatus.length === 0) {
          this.typingStatus.delete(sessionId);
        } else {
          this.typingStatus.set(sessionId, updatedTypingStatus);
        }
      });
    }, 10000);

    console.log('Socket service initialized');
  }

  /**
   * Shutdown the socket server
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
      this.userSockets = [];
      this.typingStatus.clear();
      console.log('Socket service shut down');
    }
  }

  /**
   * Emit a message to a chat session room
   * @param sessionId - Chat session ID
   * @param event - Event name
   * @param data - Event data
   */
  emitToChatSession(
    sessionId: string,
    event: string,
    data: SocketEventData
  ): void {
    this.io?.to(`chat:${sessionId}`).emit(event, data);
  }

  /**
   * Emit a typing status update to a chat session
   * @param sessionId - Chat session ID
   * @param userId - User ID
   * @param isTyping - Typing status
   */
  emitTypingStatus(sessionId: string, userId: string, isTyping: boolean): void {
    const eventData: TypingStatusEvent = {
      sessionId,
      userId,
      isTyping,
    };
    this.io?.to(`chat:${sessionId}`).emit('typing_status', eventData);
  }

  /**
   * Send a typing indicator that the AI is generating a response
   * @param sessionId - Chat session ID
   * @param isTyping - Whether the AI is typing
   */
  setAITypingStatus(sessionId: string, isTyping: boolean): void {
    const eventData: AITypingStatusEvent = {
      sessionId,
      isTyping,
    };
    this.io?.to(`chat:${sessionId}`).emit('ai_typing', eventData);
  }

  /**
   * Emit a suggestion preview to a chat session
   * @param sessionId - Chat session ID
   * @param suggestionId - The ID of the suggestion
   * @param suggestionType - The type of suggestion (board, task-breakdown, task-improvement)
   * @param preview - A preview of the suggestion content
   */
  emitSuggestionPreview(
    sessionId: string,
    suggestionId: string,
    suggestionType: 'board' | 'task-breakdown' | 'task-improvement',
    preview:
      | BoardSuggestion
      | TaskBreakdownSuggestion
      | TaskImprovementSuggestion
  ): void {
    const eventData: SuggestionPreviewEvent = {
      sessionId,
      suggestionId,
      type: suggestionType,
      preview,
    };

    this.io?.to(`chat:${sessionId}`).emit('suggestion_preview', eventData);
  }

  /**
   * Emit a suggestion update to a chat session
   * @param sessionId - Chat session ID
   * @param suggestionId - The ID of the suggestion
   * @param status - The new status of the suggestion
   */
  emitSuggestionStatusUpdate(
    sessionId: string,
    suggestionId: string,
    status: SuggestionStatus
  ): void {
    const eventData: SuggestionStatusEvent = {
      sessionId,
      suggestionId,
      status,
    };

    this.io
      ?.to(`chat:${sessionId}`)
      .emit('suggestion_status_update', eventData);
  }

  /**
   * Check if a user is typing in a chat session
   * @param sessionId - Chat session ID
   * @returns Boolean indicating if any user is typing
   */
  isUserTyping(sessionId: string): boolean {
    const typingUsers = this.typingStatus.get(sessionId) || [];
    return typingUsers.length > 0;
  }
}

export const socketService = new SocketService();
