import { Types } from 'mongoose';
import Task from '../../models/task.model';
import { chatService } from './chat.service';

/**
 * Service to resolve which tasks a user is referring to in chat messages
 */
export class TaskResolutionService {
  /**
   * Resolve which tasks the user is referring to in a message
   * @param message - The user message
   * @param sessionId - Current chat session ID
   * @returns Array of task IDs the user is likely referring to
   */
  async resolveTasksFromMessage(
    message: string,
    sessionId: Types.ObjectId | string
  ): Promise<Types.ObjectId[]> {
    // Get the chat session to access context
    const session = await chatService.getChatSession(sessionId);
    if (!session) {
      return [];
    }

    // First, try to extract explicit task IDs from the message
    const explicitTaskIds = this.extractTaskIdsFromMessage(message);
    if (explicitTaskIds.length > 0) {
      return explicitTaskIds;
    }

    // If no explicit IDs, check if we're in a board context
    if (session.context?.boardId) {
      // First check if there's a single active task in the context
      if (session.context?.taskId) {
        return [session.context.taskId];
      }

      // If we have multiple active tasks already in context, use those
      if (
        session.context?.activeTaskIds &&
        session.context.activeTaskIds.length > 0
      ) {
        return session.context.activeTaskIds;
      }

      // Otherwise, if this seems to be about multiple tasks, get all tasks from the board
      if (this.isMultiTaskRequest(message)) {
        const tasks = await Task.find({
          boardId: session.context.boardId,
        }).select('_id');

        return tasks.map((task) => task._id);
      }
    }

    // Check recent message history for task references
    // This could involve more sophisticated NLP in a production environment
    const recentMessages = await chatService.getMessages(sessionId, 10);
    const taskIdsFromHistory: Types.ObjectId[] = [];

    // Simple implementation - just check if taskId is in metadata
    // In a real implementation, you might use NLP to extract task references from message content
    for (const message of recentMessages) {
      if (
        message.metadata?.taskId &&
        typeof message.metadata.taskId === 'string'
      ) {
        const taskId = new Types.ObjectId(message.metadata.taskId);
        if (!taskIdsFromHistory.some((id) => id.equals(taskId))) {
          taskIdsFromHistory.push(taskId);
        }
      }
    }

    if (taskIdsFromHistory.length > 0) {
      return taskIdsFromHistory;
    }

    // Final fallback: return empty array - no tasks could be identified
    return [];
  }

  /**
   * Extract explicit task IDs from a message
   * @param message - Message to analyze
   */
  private extractTaskIdsFromMessage(message: string): Types.ObjectId[] {
    const foundIds: Types.ObjectId[] = [];

    // Look for task IDs in common formats
    // Example: "improve task 60a2b0d3f4b3a1c98d7e6f5a" or "task #60a2b0d3f4b3a1c98d7e6f5a"
    const idPattern = /task\s+(?:#)?([0-9a-fA-F]{24})|#([0-9a-fA-F]{24})/g;
    let match;

    while ((match = idPattern.exec(message)) !== null) {
      const id = match[1] || match[2];
      if (Types.ObjectId.isValid(id)) {
        foundIds.push(new Types.ObjectId(id));
      }
    }

    return foundIds;
  }

  /**
   * Determine if a request is about multiple tasks
   * @param message - Message to analyze
   */
  isMultiTaskRequest(message: string): boolean {
    // Check for plural forms and collective terms
    const multiTaskIndicators = [
      'tasks',
      'all tasks',
      'every task',
      'each task',
      'all of the tasks',
      'multiple tasks',
      'these tasks',
      'those tasks',
      'all of them',
      'both',
      'all',
      'every',
    ];

    const lowerMessage = message.toLowerCase();

    return multiTaskIndicators.some((term) => lowerMessage.includes(term));
  }
}

export const taskResolutionService = new TaskResolutionService();
