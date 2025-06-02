import mongoose, { Schema, Types } from 'mongoose';

export interface IChat {
  userId: Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// index for faster queries by userId
chatSchema.index({ userId: 1 });
// index for sorting by last message
chatSchema.index({ lastMessageAt: -1 });

const Chat = mongoose.model<IChat>('Chat', chatSchema);

export default Chat;
