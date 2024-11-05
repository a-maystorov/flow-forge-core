import mongoose, { Schema, Types } from 'mongoose';

export interface IColumn {
  name: string;
  tasks: Types.ObjectId[];
  boardId: Types.ObjectId;
}

const ColumnSchema: Schema = new Schema({
  name: { type: String, required: true },
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
});

const Column = mongoose.model<IColumn>('Column', ColumnSchema);

export default Column;
