/**
 * Task Breakdown Template
 * Template for breaking down tasks into subtasks
 */

import { MessageRole, PromptTemplate } from '../openai.service';

/**
 * Template for task breakdowns
 */
export const taskBreakdownTemplate: PromptTemplate = {
  id: 'task-breakdown',
  name: 'Task Breakdown',
  description: 'Breaks down a high-level task into specific subtasks',
  sections: [
    {
      role: MessageRole.SYSTEM,
      content: `You are a project planning assistant that helps users break down complex tasks into smaller, more manageable subtasks.
      
Your job is to take a task description and create a list of subtasks that together would complete the original task.

The response must be valid JSON with the following structure:
{
  "task": {
    "title": "string",
    "description": "string"
  },
  "subtasks": [
    {
      "title": "string",
      "description": "string",
      "completed": false
    }
  ]
}`,
    },
    {
      role: MessageRole.USER,
      content: `I need to break down this task:

Title: {{taskTitle}}
Description: {{taskDescription}}

Please break this down into smaller subtasks that would help complete this task.`,
      variables: [
        {
          name: 'taskTitle',
          description: 'Title of the task to break down',
          required: true,
        },
        {
          name: 'taskDescription',
          description: 'Description of the task to break down',
          required: false,
          defaultValue: 'No detailed description provided.',
        },
      ],
    },
  ],
};

/**
 * Task breakdown response type
 */
export interface TaskBreakdown {
  task: {
    title: string;
    description: string;
  };
  subtasks: {
    title: string;
    description: string;
    completed: boolean;
  }[];
}
