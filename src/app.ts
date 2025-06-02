import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
// Only importing for type information, not for runtime
import type {} from '../@types/express';
import corsMiddleware from './config/cors';
import { connectDB } from './config/database';
import { errorHandler } from './middleware';
import Chat from './models/chat.model';
import Message, { MessageRole } from './models/message.model';
import authRoutes from './routes/auth.routes';
import boardRoutes from './routes/board.routes';
import userRoutes from './routes/user.routes';
import AIService from './services/ai.service';
import { BoardContext, PreviewTask, TaskContext } from './types/ai.types';

dotenv.config();

if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(corsMiddleware);

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boards', boardRoutes);

app.get('/', async (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

// Test endpoint for Chat and Message models
app.get('/test-chat', async (req, res) => {
  try {
    // Step 1: Create a new chat
    console.log('Creating test chat...');
    const testChat = new Chat({
      userId: new mongoose.Types.ObjectId(), // Generate a valid ObjectId
      title: 'Test Chat Conversation',
    });
    await testChat.save();

    // Step 2: Add messages to the chat
    console.log('Adding messages to chat...');
    const messages = [
      {
        chatId: testChat._id,
        role: MessageRole.USER,
        content:
          'Hello, can you help me create a kanban board for my website redesign project?',
      },
      {
        chatId: testChat._id,
        role: MessageRole.ASSISTANT,
        content:
          'Of course! I can help you set up a kanban board for your website redesign. Would you like some suggested columns and tasks to get started?',
      },
      {
        chatId: testChat._id,
        role: MessageRole.USER,
        content:
          'Yes, please create columns for Planning, Design, Development, and Testing.',
      },
    ];

    // Save all messages
    await Message.insertMany(messages);

    // Step 3: Retrieve the chat with its messages
    console.log('Retrieving chat and messages...');
    const chat = await Chat.findById(testChat._id);
    const chatMessages = await Message.find({ chatId: testChat._id }).sort(
      'createdAt'
    );

    // Return the test results
    res.status(200).json({
      success: true,
      chat,
      messages: chatMessages,
      messageCount: chatMessages.length,
    });
  } catch (error) {
    console.error('Chat Test Error:', error);
    res.status(500).json({
      error: 'Chat test failed',
      details: error,
    });
  }
});

// Comprehensive test endpoint showcasing the full AI assistant workflow
app.get('/test-ai', async (req, res) => {
  try {
    // Step 1: Generate a comprehensive board for learning data structures and algorithms
    console.log('Step 1: Generating initial board...');
    const initialPrompt =
      'Create a comprehensive learning plan for mastering data structures and algorithms for a beginner programmer';
    const fakeUserId = 'test-user-id';
    const initialBoard = await AIService.generateBoardSuggestion(
      initialPrompt,
      fakeUserId
    );

    // Step 2: Create a board context from the initial board
    console.log('Step 2: Creating board context...');
    const boardContext: BoardContext = {
      name: initialBoard.name,
      description:
        initialBoard.description ||
        'Data Structures and Algorithms Learning Path',
      columns: initialBoard.columns,
    };

    // Step 3: Generate a new column for advanced topics
    console.log('Step 3: Generating a new column for advanced topics...');
    const columnPrompt =
      'Create a column for advanced algorithm techniques that would be useful for coding interviews';
    const newColumn = await AIService.generateColumn(
      boardContext,
      columnPrompt
    );

    // Step 4: Add the new column to the board context
    boardContext.columns.push(newColumn);

    // Step 5: Find a task that could be improved (using the first task from the first column)
    console.log('Step 5: Finding a task to improve...');
    let taskToImprove: PreviewTask | null = null;
    let taskColumnName = '';

    // Find the first task about arrays or data structures
    for (const column of boardContext.columns) {
      for (const task of column.tasks) {
        if (
          task.title.toLowerCase().includes('array') ||
          task.title.toLowerCase().includes('data structure') ||
          task.title.toLowerCase().includes('learn')
        ) {
          taskToImprove = task;
          taskColumnName = column.name;
          break;
        }
      }
      if (taskToImprove) break;
    }

    // If we didn't find a specific task, just use the first one
    if (
      !taskToImprove &&
      boardContext.columns.length > 0 &&
      boardContext.columns[0].tasks.length > 0
    ) {
      taskToImprove = boardContext.columns[0].tasks[0];
      taskColumnName = boardContext.columns[0].name;
    }

    if (!taskToImprove) {
      throw new Error('No suitable task found in the generated board');
    }

    // Step 6: Improve the task description
    console.log('Step 6: Improving task description...');
    const improvePrompt = `Make this task more detailed with specific learning objectives and resources for ${taskToImprove.title}`;
    const improvedTask = await AIService.improveTaskDescription(
      taskToImprove.title,
      taskToImprove.description || '',
      improvePrompt
    );

    // Step 7: Break down the improved task into subtasks
    console.log('Step 7: Breaking down task into subtasks...');
    const breakdownPrompt =
      'Create a detailed step-by-step approach for mastering this concept';
    const subtasks = await AIService.breakdownTaskIntoSubtasks(
      improvedTask.title,
      improvedTask.description,
      breakdownPrompt
    );

    // Step 8: Generate multiple tasks for a practice problems column
    console.log('Step 8: Generating practice problems...');
    let practiceColumn = boardContext.columns.find(
      (col) =>
        col.name.toLowerCase().includes('practice') ||
        col.name.toLowerCase().includes('problems') ||
        col.name.toLowerCase().includes('exercises')
    );

    if (!practiceColumn) {
      // If no practice column exists, use the last column
      practiceColumn = boardContext.columns[boardContext.columns.length - 1];
    }

    const tasksPrompt = `Create 3 practice problems related to ${improvedTask.title}: one easy, one medium, and one hard`;
    const practiceTasks = await AIService.generateMultipleTasks(
      boardContext,
      practiceColumn.name,
      tasksPrompt,
      3
    );

    // Step 9: Take one of the generated subtasks and improve its description
    console.log('Step 9: Improving a subtask description...');
    const subtaskToImprove = subtasks[0];
    const parentTaskContext: TaskContext = {
      title: improvedTask.title,
      description: improvedTask.description,
      status: 'Todo', // Now TypeScript knows this belongs to the union type
      subtasks: subtasks,
    };

    const improveSubtaskPrompt =
      'Add more specific learning objectives and practical tips';
    const improvedSubtask = await AIService.improveSubtaskDescription(
      subtaskToImprove.title,
      subtaskToImprove.description || '',
      improveSubtaskPrompt,
      parentTaskContext
    );

    // Return the entire workflow as a structured response
    res.status(200).json({
      workflow: [
        {
          step: 1,
          action: 'Generate Initial Board',
          prompt: initialPrompt,
          result: {
            name: initialBoard.name,
            description: initialBoard.description,
            columnCount: initialBoard.columns.length,
            columns: initialBoard.columns.map((c) => c.name),
          },
        },
        {
          step: 2,
          action: 'Generate New Column',
          prompt: columnPrompt,
          result: {
            name: newColumn.name,
            taskCount: newColumn.tasks.length,
            tasks: newColumn.tasks.map((t) => t.title),
          },
        },
        {
          step: 3,
          action: 'Improve Task',
          prompt: improvePrompt,
          taskDetails: {
            column: taskColumnName,
            original: {
              title: taskToImprove.title,
              description: taskToImprove.description,
            },
            improved: improvedTask,
          },
        },
        {
          step: 4,
          action: 'Break Down Task',
          prompt: breakdownPrompt,
          result: {
            subtaskCount: subtasks.length,
            subtasks: subtasks.map((st) => st.title),
          },
        },
        {
          step: 5,
          action: 'Generate Practice Tasks',
          prompt: tasksPrompt,
          result: {
            column: practiceColumn.name,
            tasks: practiceTasks.tasks.map((t) => ({
              title: t.title,
              description: t.description?.substring(0, 50) + '...',
            })),
          },
        },
        {
          step: 6,
          action: 'Improve Subtask',
          prompt: improveSubtaskPrompt,
          result: {
            original: {
              title: subtaskToImprove.title,
              description: subtaskToImprove.description,
            },
            improved: improvedSubtask,
          },
        },
      ],
      completeResults: {
        initialBoard: initialBoard,
        newColumn: newColumn,
        improvedTask: improvedTask,
        subtasks: subtasks,
        practiceTasks: practiceTasks.tasks,
        improvedSubtask: improvedSubtask,
      },
    });
  } catch (error) {
    console.error('AI Workflow Error:', error);
    res.status(500).json({
      error: 'AI workflow execution failed',
      details: error,
    });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV });
});

app.get('/api', (req, res) => {
  res.json({ message: 'CORS is working!' });
});

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
