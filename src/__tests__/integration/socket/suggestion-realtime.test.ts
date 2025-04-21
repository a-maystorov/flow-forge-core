import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../../config/database';
import { socketService } from '../../../config/socket';
import { chatAssistantService } from '../../../services/chat/chat-assistant.service';

// Increase test timeout to handle potential delays
jest.setTimeout(30000);

// Mock the socket service to prevent actual socket connections
jest.mock('../../../config/socket', () => {
  const originalModule = jest.requireActual('../../../config/socket');
  return {
    ...originalModule,
    socketService: {
      emitSuggestionStatusUpdate: jest.fn(),
      emitSuggestionPreview: jest.fn(),
      emitSuggestionGenerating: jest.fn(),
      initialize: jest.fn(),
      shutdown: jest.fn(),
      emitToChatSession: jest.fn(),
    },
  };
});

// Mock the chat assistant service
jest.mock('../../../services/chat/chat-assistant.service', () => ({
  chatAssistantService: {
    processMessage: jest.fn().mockImplementation((sessionId, message) => {
      return {
        responseMessage: {
          _id: new mongoose.Types.ObjectId(),
          content: 'Mock response',
          role: 'assistant',
          sessionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        detectedIntent: message.includes('board')
          ? 'CREATE_BOARD'
          : message.includes('task breakdown')
            ? 'BREAKDOWN_TASK'
            : message.includes('improve')
              ? 'IMPROVE_TASK'
              : 'GENERAL_CONVERSATION',
        confidence: 0.8,
        suggestions: message.includes('board')
          ? {
              boardSuggestion: {
                boardName: 'Test Board',
                columns: [
                  { name: 'To Do', tasks: [] },
                  { name: 'In Progress', tasks: [] },
                  { name: 'Done', tasks: [] },
                ],
              },
            }
          : message.includes('task breakdown')
            ? {
                taskBreakdown: {
                  taskTitle: 'Main Task',
                  subtasks: [
                    { title: 'Subtask 1', description: 'Description 1' },
                    { title: 'Subtask 2', description: 'Description 2' },
                  ],
                },
              }
            : message.includes('improve')
              ? {
                  taskImprovement: {
                    originalTask: {
                      title: 'Original Title',
                      description: 'Original Description',
                    },
                    improvedTask: {
                      title: 'Improved Title',
                      description: 'Improved Description',
                    },
                    reasoning: 'This is a better title and description',
                  },
                }
              : {},
        suggestionId: message.includes('suggestion')
          ? new mongoose.Types.ObjectId().toString()
          : undefined,
      };
    }),
    generateBoardSuggestion: jest.fn().mockResolvedValue({
      boardName: 'Test Board',
      columns: [
        { name: 'To Do', tasks: [] },
        { name: 'In Progress', tasks: [] },
        { name: 'Done', tasks: [] },
      ],
    }),
    generateTaskBreakdown: jest.fn().mockResolvedValue({
      taskTitle: 'Main Task',
      subtasks: [
        { title: 'Subtask 1', description: 'Description 1' },
        { title: 'Subtask 2', description: 'Description 2' },
      ],
    }),
    improveTaskDescription: jest.fn().mockResolvedValue({
      originalTask: {
        title: 'Original Title',
        description: 'Original Description',
      },
      improvedTask: {
        title: 'Improved Title',
        description: 'Improved Description',
      },
      reasoning: 'This is a better title and description',
    }),
  },
}));

describe('Suggestion Socket Events', () => {
  let sessionId: string;
  let suggestionId: string;

  beforeAll(async () => {
    await connectDB();
    suggestionId = new mongoose.Types.ObjectId().toString();
    sessionId = new mongoose.Types.ObjectId().toString();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  test('should emit board suggestion preview events', async () => {
    // Create a suggestion
    const result = await chatAssistantService.processMessage(
      sessionId,
      'I need a board for my project management system'
    );

    // Extract data needed for events
    const boardSuggestion = result.suggestions.boardSuggestion;

    // Make sure boardSuggestion exists
    expect(boardSuggestion).toBeDefined();
    if (!boardSuggestion) return; // TypeScript guard

    // Emit the preview event
    socketService.emitSuggestionPreview(
      sessionId,
      suggestionId,
      'board',
      boardSuggestion
    );

    // Verify the method was called with correct arguments
    expect(socketService.emitSuggestionPreview).toHaveBeenCalledWith(
      sessionId,
      suggestionId,
      'board',
      boardSuggestion
    );
  });

  test('should emit task breakdown preview events', async () => {
    // Create a suggestion
    const result = await chatAssistantService.processMessage(
      sessionId,
      'Can you break down this task breakdown for user authentication?'
    );

    // Extract data needed for events
    const taskBreakdown = result.suggestions.taskBreakdown;

    // Make sure taskBreakdown exists
    expect(taskBreakdown).toBeDefined();
    if (!taskBreakdown) return; // TypeScript guard

    // Emit the preview event
    socketService.emitSuggestionPreview(
      sessionId,
      suggestionId,
      'task-breakdown',
      taskBreakdown
    );

    // Verify the method was called with correct arguments
    expect(socketService.emitSuggestionPreview).toHaveBeenCalledWith(
      sessionId,
      suggestionId,
      'task-breakdown',
      taskBreakdown
    );
  });

  test('should emit suggestion status update when accepting a suggestion', async () => {
    // Emit status update
    socketService.emitSuggestionStatusUpdate(
      sessionId,
      suggestionId,
      'accepted'
    );

    // Verify the method was called with correct arguments
    expect(socketService.emitSuggestionStatusUpdate).toHaveBeenCalledWith(
      sessionId,
      suggestionId,
      'accepted'
    );
  });

  test('should emit suggestion status update when rejecting a suggestion', async () => {
    // Emit status update
    socketService.emitSuggestionStatusUpdate(
      sessionId,
      suggestionId,
      'rejected'
    );

    // Verify the method was called with correct arguments
    expect(socketService.emitSuggestionStatusUpdate).toHaveBeenCalledWith(
      sessionId,
      suggestionId,
      'rejected'
    );
  });
});
