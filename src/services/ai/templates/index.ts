/**
 * Template Registry
 * Centralizes all prompt templates
 */

import { openAIService } from '../openai.service';
import { boardSuggestionTemplate } from './board-suggestion.template';
import { taskBreakdownTemplate } from './task-breakdown.template';
import { taskImprovementTemplate } from './task-improvement.template';

/**
 * Register all templates with the OpenAI service
 */
export function registerTemplates(): void {
  openAIService.registerTemplate(boardSuggestionTemplate);
  openAIService.registerTemplate(taskBreakdownTemplate);
  openAIService.registerTemplate(taskImprovementTemplate);
}

// Initialize templates
registerTemplates();

// Export all templates and response types
export * from './board-suggestion.template';
export * from './task-breakdown.template';
export * from './task-improvement.template';
