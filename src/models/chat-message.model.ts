import mongoose, { Schema, Types } from 'mongoose';

export interface IChatMessage {
  sessionId: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    suggestedBoardId?: Types.ObjectId;
    suggestedTaskId?: Types.ObjectId;
    suggestedColumnId?: Types.ObjectId;
    intent?: string;
    confidence?: number;
  };
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
  },
});

ChatMessageSchema.index({ sessionId: 1, timestamp: 1 });

const ChatMessage = mongoose.model<IChatMessage>(
  'ChatMessage',
  ChatMessageSchema
);

export default ChatMessage;
