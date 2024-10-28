import mongoose, { Document, Schema } from 'mongoose';

export interface ISubtask extends Document {
  name: string;
  completed: boolean;
}

const SubtaskSchema: Schema = new Schema({
  name: { type: String, required: true },
  completed: { type: Boolean, default: false },
});

const Subtask = mongoose.model<ISubtask>('Subtask', SubtaskSchema);

export default Subtask;
