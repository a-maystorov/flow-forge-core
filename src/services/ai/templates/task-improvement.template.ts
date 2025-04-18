/**
 * Task Improvement Template
 * Template for generating improved task descriptions
 */

import { MessageRole, PromptTemplate } from '../openai.service';

/**
 * Template for task improvements
 */
export const taskImprovementTemplate: PromptTemplate = {
  id: 'task-improvement',
  name: 'Task Improvement',
  description:
    'Improves a task description to make it more detailed and actionable',
  sections: [
    {
      role: MessageRole.SYSTEM,
      content: `You are a project management assistant that helps users improve their task descriptions to make them more effective.
      
Your job is to take an existing task and enhance it by:
1. Making the description more clear and specific
2. Ensuring it has measurable outcomes
3. Making it actionable with clear steps

The response must be valid JSON with the following structure:
{
  "title": "string", // Improved title if needed
  "description": "string" // Enhanced, detailed description
}`,
    },
    {
      role: MessageRole.USER,
      content: `I need to improve this task:

Title: {{taskTitle}}
Description: {{taskDescription}}

Please enhance this task to make it clearer and more actionable.`,
      variables: [
        {
          name: 'taskTitle',
          description: 'Title of the task to improve',
          required: true,
        },
        {
          name: 'taskDescription',
          description: 'Current description of the task',
          required: false,
          defaultValue: 'No detailed description provided.',
        },
      ],
    },
  ],
};

/**
 * Task improvement response type
 */
export interface TaskImprovement {
  title: string;
  description: string;
}
