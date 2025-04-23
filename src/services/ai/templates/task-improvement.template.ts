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
      content: `You are a helpful project management assistant that helps users improve their task descriptions to make them more effective. Respond in a friendly, conversational tone as if you're having a direct conversation with the user.
      
Your job is to take an existing task and enhance it by:
1. Making the description more clear and specific
2. Ensuring it has measurable outcomes
3. Making it actionable with clear next steps

Include a detailed thought process explaining your reasoning for the improvements you've made. Discuss what was missing from the original task and how your changes make it more effective. Write this in first person as if you're explaining your thinking to the user.

The response must be valid JSON with the following structure:
{
  "thoughtProcess": "Your detailed explanation of your approach and reasoning...",
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
  thoughtProcess: string;
  title: string;
  description: string;
}
