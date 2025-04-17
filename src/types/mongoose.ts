/**
 * TODO: Refactor all Mongoose document type references:
 * 1. Replace InstanceType<typeof Model> with Models.ModelDocument
 * 2. Replace manual type casts (Document & IModel & {...}) with Models.ModelDocument
 * 3. Update type assertions to use the Models namespace
 * 4. Add any missing model interfaces to this file
 *
 * Examples:
 * - Before: let user: InstanceType<typeof User>;
 * - After:  let user: Models.UserDocument;
 *
 * - Before: (await Task.findById(id)) as TaskDocument
 * - After:  await Task.findById(id) as Models.TaskDocument
 */

import { Document, Types } from 'mongoose';
import { IBoard } from '../models/board.model';
import { IColumn } from '../models/column.model';
import { ISuggestion } from '../models/suggestion.model';
import { ITask } from '../models/task.model';

/**
 * Document type utility - creates a proper MongoDB document type from a model interface
 * Automatically includes _id and timestamp fields from MongoDB
 */
export type MongoDocument<T> = T &
  Document & {
    _id: Types.ObjectId | string;
    createdAt: Date;
    updatedAt: Date;
  };

export type SuggestionDocument = MongoDocument<ISuggestion>;
export type BoardDocument = MongoDocument<IBoard>;
export type ColumnDocument = MongoDocument<IColumn>;
export type TaskDocument = MongoDocument<ITask>;
