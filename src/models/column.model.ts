import mongoose, { Schema, Types } from 'mongoose';

export interface IColumn {
  name: string;
  boardId: Types.ObjectId;
  tasks: Types.ObjectId[];
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
