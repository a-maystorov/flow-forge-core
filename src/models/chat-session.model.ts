import mongoose, { Schema, Types } from 'mongoose';

export interface IChatSession {
  userId: Types.ObjectId;
  title: string;
  lastActive: Date;
  status: 'active' | 'archived';
  messages: Types.ObjectId[];
  context: {
    boardId?: Types.ObjectId;
    taskId?: Types.ObjectId;
    currentIntent?: string;
  };
}

const ChatSessionSchema: Schema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    default: 'New Conversation',
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
  },
  messages: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
    },
  ],
  context: {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Board',
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    currentIntent: String,
  },
});

ChatSessionSchema.index({ userId: 1, lastActive: -1 });

const ChatSession = mongoose.model<IChatSession>(
  'ChatSession',
  ChatSessionSchema
);

export default ChatSession;
