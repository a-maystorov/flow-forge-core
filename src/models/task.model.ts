import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description: string;
  status: 'Todo' | 'Doing' | 'Done';
  subtasks: {
    title: string;
    isCompleted: boolean;
  }[];
  boardId: Types.ObjectId;
}

const TaskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['Todo', 'Doing', 'Done'], default: 'Todo' },
  subtasks: [
    {
      title: { type: String, required: true },
      isCompleted: { type: Boolean, default: false },
    },
  ],
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
});

const Task = mongoose.model<ITask>('Task', TaskSchema);

export default Task;
