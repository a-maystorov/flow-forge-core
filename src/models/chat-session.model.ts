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
    activeTaskIds?: Types.ObjectId[];
    activeSuggestionIds?: Types.ObjectId[];
    contextMode?: 'single' | 'multi' | 'board';
    lastAction?: 'improvement' | 'breakdown' | 'creation';
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
    activeTaskIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    activeSuggestionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Suggestion',
      },
    ],
    contextMode: {
      type: String,
      enum: ['single', 'multi', 'board'],
    },
    lastAction: {
      type: String,
      enum: ['improvement', 'breakdown', 'creation'],
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
