/**
 * Prompt for generating a board plan based on a project description
 */
export const getBoardCreationPrompt = (projectDescription: string) => `
You are an AI assistant helping with project management.

PROJECT DESCRIPTION:
${projectDescription}

Based on this description, create a project board with appropriate columns for tracking project tasks.

Respond ONLY with a valid JSON object with the following structure:
{
  "board": {
    "title": "Project title",
    "description": "Detailed project description",
    "columns": [
      {
        "title": "Column title (e.g., 'To Do', 'In Progress', etc.)",
        "description": "Purpose of this column"
      }
    ]
  },
  "explanation": "Brief explanation of how this board structure will help manage the project"
}

The title should be concise but descriptive.
The description should expand on the title and provide more context about the project.
Each column should represent a meaningful stage in the project workflow.
`;

/**
 * Prompt for generating new task details based on a description
 */
export const getTaskCreationPrompt = (
  taskDescription: string,
  columnId: string
) => `
You are an AI assistant helping with project management.

TASK DESCRIPTION:
${taskDescription}

COLUMN ID:
${columnId}

Based on this description, create a detailed task that would belong in the specified column.

Respond ONLY with a valid JSON object with the following structure:
{
  "task": {
    "title": "Task title",
    "description": "Detailed task description",
    "priority": "low, medium, or high",
    "dueDate": "Due date in ISO format (e.g., 2023-06-30) or null if not specified",
    "status": "Status of the task",
    "subtasks": [
      {
        "title": "Subtask title",
        "description": "Subtask description"
      }
    ]
  },
  "explanation": "Brief explanation of how this task relates to the project"
}

The title should be concise but descriptive.
The description should provide detailed information about what needs to be done.
Include subtasks only if they are clearly needed based on the task description.
`;

/**
 * Prompt for generating new column details based on a description
 */
export const getColumnCreationPrompt = (
  columnDescription: string,
  boardId: string
) => `
You are an AI assistant helping with project management.

COLUMN DESCRIPTION:
${columnDescription}

BOARD ID:
${boardId}

Based on this description, create a detailed column that would be part of the specified board.

Respond ONLY with a valid JSON object with the following structure:
{
  "column": {
    "title": "Column title",
    "description": "Detailed column description",
    "wip_limit": null or a number (work in progress limit)
  },
  "explanation": "Brief explanation of how this column fits into the project board"
}

The title should be concise but descriptive.
The description should explain the purpose of this column in the workflow.
`;

/**
 * Prompt for generating subtask details based on a description
 */
export const getSubtaskCreationPrompt = (
  subtaskDescription: string,
  taskId: string
) => `
You are an AI assistant helping with project management.

SUBTASK DESCRIPTION:
${subtaskDescription}

TASK ID:
${taskId}

Based on this description, create a detailed subtask that would belong to the specified task.

Respond ONLY with a valid JSON object with the following structure:
{
  "subtask": {
    "title": "Subtask title",
    "description": "Detailed subtask description",
    "completed": false
  },
  "explanation": "Brief explanation of how this subtask contributes to completing the parent task"
}

The title should be concise but descriptive.
The description should provide clear instructions on what needs to be done.
`;
