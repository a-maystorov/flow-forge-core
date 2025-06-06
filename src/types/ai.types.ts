import { Types } from 'mongoose';
import { IBoard } from '../models/board.model';
import { IColumn } from '../models/column.model';
import { ISubtask } from '../models/subtask.model';
import { ITask } from '../models/task.model';

// --- Raw AI Output Types ---
// These represent the structure of JSON data returned by the OpenAI API

export interface RawAITaskOutput {
  title?: string;
  description?: string;
  subtasks?: RawAITaskOutput[];
}

export interface RawAIColumnOutput {
  name?: string;
  tasks?: RawAITaskOutput[];
}

export interface RawAIBoardOutput {
  name?: string;
  description?: string;
  columns?: RawAIColumnOutput[];
}

export interface RawAISubtaskOutput {
  title?: string;
  description?: string;
}

export interface RawAISubtaskBreakdownOutput {
  subtasks?: RawAISubtaskOutput[];
}

// --- Preview Types ---
// These types represent the structured data returned by the AI Service

/**
 * Preview version of ISubtask
 * - Uses embedded subtasks instead of ObjectId references
 */
export type PreviewSubtask = Pick<ISubtask, 'title' | 'description'>;

/**
 * Preview version of ITask
 * - Uses embedded subtasks instead of ObjectId references
 * - Maintains consistency with the ITask interface structure
 */
export type PreviewTask = Pick<ITask, 'title' | 'description'> & {
  // Preview-specific properties with embedded subtasks
  subtasks?: PreviewSubtask[];
};

/**
 * Preview version of IColumn
 * - Uses embedded tasks instead of ObjectId references
 * - Derived from IColumn but replaces references with embedded objects
 */
export type PreviewColumn = Pick<IColumn, 'name'> & {
  // Preview-specific properties with embedded tasks
  tasks: PreviewTask[];
};

/**
 * Preview version of IBoard
 * - Uses embedded columns instead of ObjectId references
 * - Uses string userId instead of Types.ObjectId
 */
export type PreviewBoard = Pick<IBoard, 'name' | 'ownerId'> & {
  // Additional fields not in IBoard
  description?: string;

  // Instead of columns: Types.ObjectId[], we embed the columns
  columns: PreviewColumn[];
};

// --- Context Interfaces ---
// These provide context to the AI for generating better responses

/**
 * Simplified representation of a column for context purposes
 */
export interface ColumnContext {
  name: string;
  tasks: TaskContext[];
}

/**
 * Simplified representation of a task for context purposes
 */
export interface TaskContext {
  title: string;
  description?: string;
  subtasks?: SubtaskContext[];
}

/**
 * Simplified representation of a subtask for context purposes
 */
export interface SubtaskContext {
  title: string;
  description?: string;
}

/**
 * Complete board context to provide to the AI for more accurate generations
 */
export interface BoardContext {
  name: string;
  description?: string;
  columns: ColumnContext[];
}

// --- Conversion Interfaces ---
// These help with converting Preview objects to MongoDB models

/**
 * Interface for board conversion parameters
 */
export interface BoardConversion {
  board: PreviewBoard;
  userId: Types.ObjectId | string;
}

/**
 * Interface for AI-generated multi-column response
 */
export interface MultiColumnGenerationResult {
  columns: PreviewColumn[];
}

/**
 * Interface for AI-generated multi-task response
 */
export interface MultiTaskGenerationResult {
  tasks: PreviewTask[];
}
