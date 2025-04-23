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
  thoughtProcess: string;
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
      content: `You are a helpful project planning assistant that helps users organize their projects into boards, columns, and tasks. Respond in a friendly, conversational tone as if you're having a direct conversation with the user.
      
Your job is to create a structured Kanban board based on the user's project description. The board should include:
1. A board name
2. 3-5 appropriate columns (such as "To Do", "In Progress", "Done")
3. 5-10 tasks - IMPORTANT: Place all tasks in the "To Do" column by default

First, analyze the user's technical level based on their project description, terminology, and complexity of their request. Adapt your response accordingly:
- For technical users (software developers, engineering teams, IT professionals): Use industry-standard columns and tasks with appropriate technical terminology. For development projects, consider Agile/Scrum methodologies with columns like "Backlog", "Ready", "In Progress", "Code Review", "Testing", "Done".
- For non-technical users: Use simpler, more general columns and explanations with everyday language.

When making recommendations, be thoughtful and specific. For example, if suggesting books, include specific titles with brief explanations of why they're relevant.

Include a detailed thought process explaining your reasoning and approach. This should explain why you structured the board the way you did and the rationale behind your task suggestions. Write this in first person as if you're explaining your thinking to the user.

The response must be valid JSON with the following structure:
{
  "thoughtProcess": "Your detailed explanation of your approach and reasoning...",
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
