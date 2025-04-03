import mongoose, { Document, Schema, Types } from 'mongoose';

export interface BaseEntity {
  id: string;
  title: string;
  description: string;
}

export interface BaseTask extends BaseEntity {
  position: number;
}
export interface BaseSubtask extends BaseEntity {
  completed: boolean;
}

export enum SuggestionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
}

export interface BoardSuggestion {
  boardName: string;
  columns: {
    name: string;
    position: number;
    tasks: BaseTask[];
  }[];
}

export interface TaskBreakdownSuggestion {
  taskTitle: string;
  taskDescription: string;
  subtasks: BaseSubtask[];
}

export interface TaskImprovementSuggestion {
  title: string;
  description: string;
}

export interface SuggestionMetadata {
  taskId?: string;
  boardId?: string;
  columnId?: string;
  parentTaskId?: string;
  relatedSuggestionId?: string | Types.ObjectId;
}

export interface ISuggestion extends Document {
  userId: Types.ObjectId;
  sessionId: Types.ObjectId;
  type: 'board' | 'task-breakdown' | 'task-improvement';
  status: SuggestionStatus;
  content:
    | BoardSuggestion
    | TaskBreakdownSuggestion
    | TaskImprovementSuggestion;
  originalMessage: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: SuggestionMetadata;
  relatedSuggestionId?: Types.ObjectId;
}

const SuggestionSchema = new Schema<ISuggestion>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatSession',
      required: true,
    },
    type: {
      type: String,
      enum: ['board', 'task-breakdown', 'task-improvement'],
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SuggestionStatus),
      default: SuggestionStatus.PENDING,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    originalMessage: {
      type: String,
      required: true,
    },
    metadata: {
      taskId: String,
      boardId: String,
      columnId: String,
      parentTaskId: String,
      relatedSuggestionId: { type: Schema.Types.ObjectId, ref: 'Suggestion' },
    },
    relatedSuggestionId: {
      type: Schema.Types.ObjectId,
      ref: 'Suggestion',
    },
  },
  { timestamps: true }
);

SuggestionSchema.pre('save', function (next) {
  if (this.type === 'board') {
    const boardSuggestion = this.content as BoardSuggestion;

    boardSuggestion.columns.forEach((column) => {
      column.tasks.forEach((task) => {
        if (!task.id) {
          task.id = new mongoose.Types.ObjectId().toString();
        }
      });
    });
  } else if (this.type === 'task-breakdown') {
    const taskBreakdown = this.content as TaskBreakdownSuggestion;

    taskBreakdown.subtasks.forEach((subtask) => {
      if (!subtask.id) {
        subtask.id = new mongoose.Types.ObjectId().toString();
      }
    });
  }

  next();
});

export const Suggestion = mongoose.model<ISuggestion>(
  'Suggestion',
  SuggestionSchema
);
