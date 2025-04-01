import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import User from '../../../models/user.model';
import { assistantService } from '../../../services/ai';

// Mock the assistant service methods
jest.mock('../../../services/ai', () => ({
  assistantService: {
    generateBoardSuggestion: jest.fn(),
    generateTaskBreakdown: jest.fn(),
    improveTaskDescription: jest.fn(),
  },
}));

// Get the mocked methods with proper typing
const mockedAssistantService = assistantService as jest.Mocked<
  typeof assistantService
>;

describe('/api/ai', () => {
  let user: InstanceType<typeof User>;
  let token: string;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  const createUserAndToken = async () => {
    user = new User({
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
    });

    await user.save();
    token = user.generateAuthToken();
  };

  describe('POST /board-suggestion', () => {
    const execRequest = async (description: string) => {
      return request(app)
        .post('/api/ai/board-suggestion')
        .set('x-auth-token', token)
        .send({ description });
    };

    beforeEach(async () => {
      await createUserAndToken();
    });

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execRequest('Test Project');
      expect(res.status).toBe(401);
    });

    it('should return 400 if project description is not provided', async () => {
      const res = await request(app)
        .post('/api/ai/board-suggestion')
        .set('x-auth-token', token)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 if the assistant fails to generate a suggestion', async () => {
      mockedAssistantService.generateBoardSuggestion.mockResolvedValue(null);

      const res = await execRequest('Test Project');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        'message',
        'Failed to generate board suggestion'
      );
      expect(
        mockedAssistantService.generateBoardSuggestion
      ).toHaveBeenCalledWith('Test Project');
    });

    it('should return 200 with board suggestions if successful', async () => {
      const mockSuggestion = {
        boardName: 'Test Project Board',
        columns: [
          { name: 'To Do', position: 0, tasks: [] },
          { name: 'In Progress', position: 1, tasks: [] },
          { name: 'Done', position: 2, tasks: [] },
        ],
      };

      mockedAssistantService.generateBoardSuggestion.mockResolvedValue(
        mockSuggestion
      );

      const res = await execRequest('Test Project');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockSuggestion);
      expect(
        mockedAssistantService.generateBoardSuggestion
      ).toHaveBeenCalledWith('Test Project');
    });
  });

  describe('POST /task-breakdown', () => {
    const execRequest = async (description: string) => {
      return request(app)
        .post('/api/ai/task-breakdown')
        .set('x-auth-token', token)
        .send({ description });
    };

    beforeEach(async () => {
      await createUserAndToken();
    });

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execRequest('Implement login feature');
      expect(res.status).toBe(401);
    });

    it('should return 400 if task description is not provided', async () => {
      const res = await request(app)
        .post('/api/ai/task-breakdown')
        .set('x-auth-token', token)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 if the assistant fails to generate subtasks', async () => {
      mockedAssistantService.generateTaskBreakdown.mockResolvedValue(null);

      const res = await execRequest('Implement login feature');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        'message',
        'Failed to generate task breakdown'
      );
      expect(mockedAssistantService.generateTaskBreakdown).toHaveBeenCalledWith(
        'Implement login feature'
      );
    });

    it('should return 200 with subtasks if successful', async () => {
      const mockTaskBreakdown = {
        taskTitle: 'Login Feature',
        taskDescription:
          'Implement user authentication with email and password',
        subtasks: [
          {
            title: 'Design login form',
            description: 'Create UI components for login',
            completed: false,
          },
          {
            title: 'Implement form validation',
            description: 'Add client-side validation',
            completed: false,
          },
          {
            title: 'Connect to authentication API',
            description: 'Integrate with backend services',
            completed: false,
          },
        ],
      };

      mockedAssistantService.generateTaskBreakdown.mockResolvedValue(
        mockTaskBreakdown
      );

      const res = await execRequest('Implement login feature');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ subtasks: mockTaskBreakdown.subtasks });
      expect(mockedAssistantService.generateTaskBreakdown).toHaveBeenCalledWith(
        'Implement login feature'
      );
    });
  });

  describe('POST /task-improvement', () => {
    const execRequest = async (title: string, description?: string) => {
      return request(app)
        .post('/api/ai/task-improvement')
        .set('x-auth-token', token)
        .send({ title, description });
    };

    beforeEach(async () => {
      await createUserAndToken();
    });

    it('should return 401 if auth token is empty', async () => {
      token = '';
      const res = await execRequest('Implement login');
      expect(res.status).toBe(401);
    });

    it('should return 400 if task title is not provided', async () => {
      const res = await request(app)
        .post('/api/ai/task-improvement')
        .set('x-auth-token', token)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 if the assistant fails to generate suggestions', async () => {
      mockedAssistantService.improveTaskDescription.mockResolvedValue(null);

      const res = await execRequest('Implement login');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        'message',
        'Failed to generate improvement suggestions'
      );
      expect(
        mockedAssistantService.improveTaskDescription
      ).toHaveBeenCalledWith('Implement login', undefined);
    });

    it('should return 200 with suggestions if successful', async () => {
      const mockSuggestions = {
        title: 'Implement Secure Login',
        description:
          'Implement user authentication with email and password, including two-factor authentication option',
      };

      mockedAssistantService.improveTaskDescription.mockResolvedValue(
        mockSuggestions
      );

      const res = await execRequest(
        'Implement login',
        'Basic login functionality'
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ suggestions: mockSuggestions });
      expect(
        mockedAssistantService.improveTaskDescription
      ).toHaveBeenCalledWith('Implement login', 'Basic login functionality');
    });
  });
});
