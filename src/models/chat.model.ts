import mongoose, { Document, Schema, Types } from 'mongoose';

interface IMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface IActiveContext {
  type: 'board' | 'column' | 'task' | 'subtask';
  id: Types.ObjectId;
}

export interface IChat extends Document {
  userId: Types.ObjectId;
  messages: IMessage[];
  boardId?: Types.ObjectId;
  activeContext?: IActiveContext;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ['system', 'user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const ActiveContextSchema = new Schema<IActiveContext>({
  type: {
    type: String,
    enum: ['board', 'column', 'task', 'subtask'],
    required: true,
  },
  id: {
    type: Schema.Types.ObjectId,
    required: true,
  },
});

const ChatSchema = new Schema<IChat>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messages: [MessageSchema],
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
    },
    activeContext: ActiveContextSchema,
  },
  { timestamps: true }
);

ChatSchema.index({ userId: 1, updatedAt: -1 });
ChatSchema.index({ boardId: 1, updatedAt: -1 });

const Chat = mongoose.model<IChat>('Chat', ChatSchema);
export default Chat;
