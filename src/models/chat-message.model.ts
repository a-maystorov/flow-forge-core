import mongoose, { Schema, Types } from 'mongoose';

export enum MessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
}

export interface ChatMessageMetadata {
  suggestedBoardId?: Types.ObjectId;
  suggestedTaskId?: Types.ObjectId;
  suggestedColumnId?: Types.ObjectId;
  intent?: string;
  confidence?: number;
  readReceipts?: string[];
  [key: string]: unknown; // For any other properties that might be added
}

export interface IChatMessage {
  sessionId: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: ChatMessageMetadata;
  status?: MessageStatus;
}

const ChatMessageSchema: Schema = new Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatSession',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.SENT,
  },
  metadata: {
    suggestedBoardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
    },
    suggestedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    suggestedColumnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Column',
    },
    intent: String,
    confidence: Number,
    readReceipts: [String], // Array of user IDs who have read the message
  },
});

ChatMessageSchema.index({ sessionId: 1, timestamp: 1 });

const ChatMessage = mongoose.model<IChatMessage>(
  'ChatMessage',
  ChatMessageSchema
);

export default ChatMessage;
