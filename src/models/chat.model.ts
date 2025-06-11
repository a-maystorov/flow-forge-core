import mongoose, { Schema, Types } from 'mongoose';
import { BoardContext } from '../types/ai.types';

export interface IChat {
  userId: Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  boardContext: BoardContext;
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
    boardContext: {
      name: {
        type: String,
        default: '',
      },
      description: {
        type: String,
        default: '',
      },
      columns: [
        {
          name: {
            type: String,
            required: true,
          },
          tasks: [
            {
              title: {
                type: String,
                required: true,
              },
              description: {
                type: String,
                default: '',
              },
              subtasks: [
                {
                  title: {
                    type: String,
                    required: true,
                  },
                  description: {
                    type: String,
                    default: '',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1 });
chatSchema.index({ lastMessageAt: -1 });

const Chat = mongoose.model<IChat>('Chat', chatSchema);

export default Chat;
