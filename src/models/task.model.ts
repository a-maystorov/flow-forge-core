import mongoose, { Schema, Types } from 'mongoose';

export interface ITask {
  title: string;
  description?: string;
  status: 'Todo' | 'Doing' | 'Done';
  subtasks: Types.ObjectId[];
  columnId: Types.ObjectId;
  position: number;
}

const TaskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  status: { type: String, enum: ['Todo', 'Doing', 'Done'], default: 'Todo' },
  subtasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subtask' }],
  columnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Column',
    required: true,
  },
  position: { type: Number, required: false },
});

TaskSchema.pre('save', async function (next) {
  if (this.isNew && this.position === undefined) {
    const count = await Task.countDocuments({ columnId: this.columnId });
    this.position = count;
  }
  next();
});

const Task = mongoose.model<ITask>('Task', TaskSchema);

export default Task;
