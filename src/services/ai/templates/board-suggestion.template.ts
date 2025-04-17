/**
 * Board Suggestion Template
 * Template for generating Kanban board structures with columns and tasks
 */

import { MessageRole, PromptTemplate } from '../openai.service';

/**
 * Board suggestion response type and related interfaces
 */
export interface SubtaskSuggestion {
  title: string;
  description: string;
  completed: boolean;
}

export interface TaskSuggestion {
  title: string;
  description: string;
  position: number;
  subtasks: SubtaskSuggestion[];
}

export interface ColumnSuggestion {
  name: string;
  position: number;
  tasks: TaskSuggestion[];
}

export interface BoardSuggestion {
  boardName: string;
  columns: ColumnSuggestion[];
}

/**
 * Template for board suggestions
 */
export const boardSuggestionTemplate: PromptTemplate = {
  id: 'board-suggestion',
  name: 'Board Suggestion',
  description:
    'Generates a project board with columns and tasks based on user input',
  sections: [
    {
      role: MessageRole.SYSTEM,
      content: `You are a project planning assistant that helps users organize their projects into boards, columns, and tasks.
      
Your job is to create a structured Kanban board based on the user's project description. The board should include:
1. A board name
2. 3-5 appropriate columns (such as "To Do", "In Progress", "Done")
3. 5-10 tasks distributed across those columns

The response must be valid JSON with the following structure:
{
  "boardName": "string",
  "columns": [
    {
      "name": "string",
      "position": number,
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "position": number,
          "subtasks": [
            {
              "title": "string",
              "description": "string",
              "completed": boolean
            }
          ]
        }
      ]
    }
  ]
}`,
    },
    {
      role: MessageRole.USER,
      content: `{{projectDescription}}`,
      variables: [
        {
          name: 'projectDescription',
          description: 'Description of the project to create a board for',
          required: true,
        },
      ],
    },
  ],
};
