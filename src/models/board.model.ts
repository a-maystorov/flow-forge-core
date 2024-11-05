import mongoose, { Schema, Types } from 'mongoose';

export interface IBoard {
  name: string;
  columns: Types.ObjectId[];
  ownerId: Types.ObjectId;
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
