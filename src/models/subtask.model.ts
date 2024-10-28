import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISubtask extends Document {
  name: string;
  taskId: Types.ObjectId;
  completed: boolean;
}

const SubtaskSchema: Schema = new Schema({
  name: { type: String, required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  completed: { type: Boolean, default: false },
});

const Subtask = mongoose.model<ISubtask>('Subtask', SubtaskSchema);

export default Subtask;
