import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IColumn extends Document {
  name: string;
  boardId: Types.ObjectId;
  taskIds: Types.ObjectId[];
}

const ColumnSchema: Schema = new Schema({
  name: { type: String, required: true },
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
  taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
});

const Column = mongoose.model<IColumn>('Column', ColumnSchema);

export default Column;
