import mongoose, { Schema, Types } from 'mongoose';
import { IBoard } from './board.model';
import { IColumn } from './column.model';
import { ITask } from './task.model';
import { ISubtask } from './subtask.model';

type WithStringId<T> = Omit<T, '_id'> & { _id?: Types.ObjectId | string };

export type BoardEntity = WithStringId<IBoard>;
export type ColumnEntity = WithStringId<IColumn>;
export type TaskEntity = WithStringId<ITask>;
export type SubtaskEntity = WithStringId<ISubtask>;

export type EntityType =
  | BoardEntity
  | ColumnEntity
  | TaskEntity
  | SubtaskEntity;

// Define a type for metadata that can contain columns data
export interface ColumnMetadata {
  name: string;
  description?: string;
  position?: number;
  tasks?: Array<{
    title?: string;
    name?: string;
    description?: string;
    status?: string;
    position?: number;
    subtasks?: Array<{
      title?: string;
      name?: string;
      description?: string;
      completed?: boolean;
    }>;
  }>;
}

// Define the possible metadata shapes
export interface PreviewMetadata {
  columns?: ColumnMetadata[];
  [key: string]: unknown; // Allow other metadata fields with unknown type
}

export interface IPreview {
  userId: Types.ObjectId;
  operation: 'create' | 'update' | 'delete';
  entityType: 'board' | 'column' | 'task' | 'subtask';
  originalEntity?: EntityType; // For updates, store original state
  proposedEntity: EntityType; // Store proposed changes
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  expiresAt: Date;
  metadata?: PreviewMetadata; // For storing additional data with specific types
}

const PreviewSchema: Schema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  operation: {
    type: String,
    enum: ['create', 'update', 'delete'],
    required: true,
  },
  entityType: {
    type: String,
    enum: ['board', 'column', 'task', 'subtask'],
    required: true,
  },
  originalEntity: {
    type: Schema.Types.Mixed,
  },
  proposedEntity: {
    type: Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  metadata: {
    type: Schema.Types.Mixed, // Allows for flexible storage of additional data
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Auto-delete after expiration
  },
});

const Preview = mongoose.model<IPreview>('Preview', PreviewSchema);

export default Preview;
