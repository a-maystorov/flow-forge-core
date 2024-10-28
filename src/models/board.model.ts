import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBoard extends Document {
  name: string;
  ownerId: Types.ObjectId;
  columns: {
    name: string;
    tasks: Types.ObjectId[];
  }[];
}

const BoardSchema: Schema = new Schema({
  name: { type: String, required: true },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  columns: [
    {
      name: { type: String, required: true },
      tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    },
  ],
});

const Board = mongoose.model<IBoard>('Board', BoardSchema);
export default Board;
