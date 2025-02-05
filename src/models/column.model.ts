import mongoose, { Types, Schema } from 'mongoose';

export interface IColumn {
  name: string;
  tasks: Types.ObjectId[];
  boardId: Types.ObjectId;
  position?: number;
}

const ColumnSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
  },
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  position: { type: Number },
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
});

ColumnSchema.index({ boardId: 1, position: 1 });

const Column = mongoose.model<IColumn>('Column', ColumnSchema);

export default Column;
