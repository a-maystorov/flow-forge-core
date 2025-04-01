import {
  TaskEntity,
  BoardEntity,
  ColumnEntity,
  SubtaskEntity,
} from '../../../models/preview.model';

/**
 * Prompt for generating task updates based on user request
 */
export const getTaskUpdatePrompt = (
  taskData: TaskEntity,
  userRequest: string
) => `
You are an AI assistant helping with project management tasks.

CURRENT TASK:
${JSON.stringify(taskData, null, 2)}

USER REQUEST:
${userRequest}

Please suggest updates to this task based on the user's request. 
Consider:
- Updating the title if needed for clarity
- Modifying the description to add details
- Adjusting status if mentioned
- Adding, updating, or removing subtasks if specified

Respond ONLY with a valid JSON object with the following structure:
{
  "updates": {
    "title": "Updated title if changed",
    "description": "Updated description if changed",
    "status": "Updated status if changed",
    "priority": "Updated priority if changed",
    "dueDate": "Updated due date if changed (ISO format)",
    "subtasks": [
      {
        "title": "Subtask title",
        "description": "Subtask description",
        "completed": false
      }
    ]
  },
  "explanation": "Brief explanation of what changes were made and why"
}

Only include fields that need to be changed. If a field doesn't need updating, omit it from the response.
`;

/**
 * Prompt for generating board updates based on user request
 */
export const getBoardUpdatePrompt = (
  boardData: BoardEntity,
  userRequest: string
) => `
You are an AI assistant helping with project management.

CURRENT BOARD:
${JSON.stringify(boardData, null, 2)}

USER REQUEST:
${userRequest}

Please suggest updates to this board based on the user's request.
Consider:
- Updating the title if needed for clarity
- Modifying the description to add details
- Suggesting column reorganization if appropriate

Respond ONLY with a valid JSON object with the following structure:
{
  "updates": {
    "title": "Updated title if changed",
    "description": "Updated description if changed",
    "columns": [
      {
        "id": "existing column id if present",
        "title": "Column title",
        "order": numeric order position
      }
    ]
  },
  "explanation": "Brief explanation of what changes were made and why"
}

Only include fields that need to be changed. If a field doesn't need updating, omit it from the response.
`;

/**
 * Prompt for generating column updates based on user request
 */
export const getColumnUpdatePrompt = (
  columnData: ColumnEntity,
  userRequest: string
) => `
You are an AI assistant helping with project management.

CURRENT COLUMN:
${JSON.stringify(columnData, null, 2)}

USER REQUEST:
${userRequest}

Please suggest updates to this column based on the user's request.
Consider:
- Updating the title if needed for clarity
- Modifying the description to add details
- Suggesting task reorganization if appropriate

Respond ONLY with a valid JSON object with the following structure:
{
  "updates": {
    "title": "Updated title if changed",
    "description": "Updated description if changed",
    "tasks": [
      {
        "id": "existing task id if present",
        "title": "Task title",
        "order": numeric order position
      }
    ]
  },
  "explanation": "Brief explanation of what changes were made and why"
}

Only include fields that need to be changed. If a field doesn't need updating, omit it from the response.
`;

/**
 * Prompt for generating subtask updates based on user request
 */
export const getSubtaskUpdatePrompt = (
  subtaskData: SubtaskEntity,
  userRequest: string
) => `
You are an AI assistant helping with project management.

CURRENT SUBTASK:
${JSON.stringify(subtaskData, null, 2)}

USER REQUEST:
${userRequest}

Please suggest updates to this subtask based on the user's request.
Consider:
- Updating the title if needed for clarity
- Modifying the description to add details
- Changing completion status if mentioned

Respond ONLY with a valid JSON object with the following structure:
{
  "updates": {
    "title": "Updated title if changed",
    "description": "Updated description if changed",
    "completed": boolean completion status if changed
  },
  "explanation": "Brief explanation of what changes were made and why"
}

Only include fields that need to be changed. If a field doesn't need updating, omit it from the response.
`;
