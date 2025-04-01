import { Types } from 'mongoose';
import OpenAI from 'openai';
import openaiConfig from '../../config/openai';
import { TaskEntity } from '../../models/preview.model';
import Task from '../../models/task.model';
import { EntityMapperService } from './entity-mapper.service';
import { getTaskUpdatePrompt } from './prompts/update-prompts';

export class TaskUpdateService {
  private openai: OpenAI;
  private entityMapperService: EntityMapperService;

  constructor() {
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
      // Remove the organization parameter since it's causing authentication errors
    });
    this.entityMapperService = new EntityMapperService();
  }

  /**
   * Suggest updates to a task based on user request
   * @param taskId - ID of the task to update
   * @param userRequest - User's natural language request for changes
   * @param userId - User ID requesting the update
   * @returns Preview of the suggested task update
   */
  async suggestTaskUpdate(
    taskId: string | Types.ObjectId,
    userRequest: string,
    userId: string | Types.ObjectId
  ) {
    try {
      // Fetch the task with its subtasks
      const task = await Task.findById(taskId).populate('subtasks');

      if (!task) {
        throw new Error('Task not found');
      }

      // Create the prompt with task context
      const prompt = getTaskUpdatePrompt(task.toObject(), userRequest);

      // Send the request to OpenAI
      const response = await this.openai.chat.completions.create({
        model: openaiConfig.model,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
        ],
        temperature: openaiConfig.temperature,
        max_tokens: openaiConfig.maxTokens,
        response_format: { type: 'json_object' },
      });

      // Parse the response
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Failed to get update suggestions from AI');
      }

      const suggestions = JSON.parse(content);

      // Create the updated task entity
      const updatedTaskData: Partial<TaskEntity> = {
        ...suggestions.updates,
      };

      // Create a preview for the update
      return this.entityMapperService.createTaskUpdatePreview(
        taskId,
        updatedTaskData,
        userId
      );
    } catch (error) {
      console.error('Error suggesting task update:', error);
      throw error;
    }
  }
}
