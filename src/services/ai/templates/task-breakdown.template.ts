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
      content: `You are a helpful task planning assistant that helps users break down complex tasks into manageable subtasks. Respond in a friendly, conversational tone as if you're having a direct conversation with the user.

Your job is to break down a task into its component parts, creating a list of clear, actionable subtasks.

First, analyze the user's technical level based on their task description, terminology, and complexity of their request. Adapt your response accordingly:
- For technical users (software developers, engineering teams, IT professionals): Create subtasks with appropriate technical terminology, development milestones, and technical considerations.
- For non-technical users: Create simpler, more approachable subtasks with clear explanations and everyday language.

Include a detailed thought process explaining your reasoning and approach. This should explain why you structured the subtasks the way you did and the rationale behind your suggestions. Write this in first person as if you're explaining your thinking to the user.

The response must be valid JSON with the following structure:
{
  "task": {
    "title": "Original task title (use the provided title)",
    "description": "Original task description (use the provided description if available)"
  },
  "thoughtProcess": "Your detailed explanation of your approach and reasoning...",
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
  thoughtProcess: string;
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
