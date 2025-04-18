/**
 * MongoDB document type definitions for Flow Forge
 * Provides centralized document types for all models
 */

import { Document, Model, Types } from 'mongoose';
import { IBoard } from '../models/board.model';
import { IChatMessage } from '../models/chat-message.model';
import { IChatSession } from '../models/chat-session.model';
import { IColumn } from '../models/column.model';
import { ISubtask } from '../models/subtask.model';
import { ISuggestion } from '../models/suggestion.model';
import { ITask } from '../models/task.model';
import { IUser } from '../models/user.model';

/**
 * Document type utility - creates a proper MongoDB document type from a model interface
 * Automatically includes _id and timestamp fields from MongoDB
 *
 * The Document<unknown, object, T> pattern ensures compatibility with Mongoose's document return types
 */
export type MongoDocument<T> = Document<unknown, object, T> &
  T & {
    _id: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
  };

/**
 * Centralized document types and model interfaces
 * This provides a single source of truth for MongoDB documents
 */

// Model document types
export type UserDocument = MongoDocument<IUser> & {
  generateAuthToken(): string;
  convertToRegisteredUser(email: string, password: string): Promise<void>;
};

export type BoardDocument = MongoDocument<IBoard>;
export type ColumnDocument = MongoDocument<IColumn>;
export type TaskDocument = MongoDocument<ITask>;
export type SubtaskDocument = MongoDocument<ISubtask>;
export type SuggestionDocument = MongoDocument<ISuggestion>;
export type ChatSessionDocument = MongoDocument<IChatSession>;
export type ChatMessageDocument = MongoDocument<IChatMessage>;

// Model static types
export interface UserModel
  extends Model<IUser, Record<string, never>, UserDocument> {
  cleanupExpiredGuests(): Promise<void>;
}

// Model interfaces (re-exported for convenience)
export type User = IUser;
export type Board = IBoard;
export type Column = IColumn;
export type Task = ITask;
export type Subtask = ISubtask;
export type Suggestion = ISuggestion;
export type ChatSession = IChatSession;
export type ChatMessage = IChatMessage;

/**
 * Utility for safely converting IDs to ObjectId
 */
export const toObjectId = (id: string | Types.ObjectId): Types.ObjectId => {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
};
