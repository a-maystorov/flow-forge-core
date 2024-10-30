import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBoard extends Document {
  name: string;
  ownerId: Types.ObjectId;
  columns: Types.ObjectId[];
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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Column',
    },
  ],
});

const Board = mongoose.model<IBoard>('Board', BoardSchema);

export default Board;
