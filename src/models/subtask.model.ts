import mongoose, { Schema, Types } from 'mongoose';

export interface ISubtask {
  title: string;
  description?: string;
  completed: boolean;
  taskId: Types.ObjectId;
}

const SubtaskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  completed: { type: Boolean, default: false },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Column',
    required: true,
  },
});

const Subtask = mongoose.model<ISubtask>('Subtask', SubtaskSchema);

export default Subtask;
