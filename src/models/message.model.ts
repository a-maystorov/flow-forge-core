import mongoose, { Schema, Types } from 'mongoose';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface IMessage {
  chatId: Types.ObjectId;
  role: MessageRole;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(MessageRole),
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// index for faster queries by chatId
messageSchema.index({ chatId: 1, createdAt: 1 });

const Message = mongoose.model<IMessage>('Message', messageSchema);

export default Message;
