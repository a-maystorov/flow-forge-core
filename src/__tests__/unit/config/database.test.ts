import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../../config/database';

jest.mock('mongoose', () => ({
  connect: jest.fn(),
  connection: {
    close: jest.fn(),
  },
}));

jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: jest.fn().mockResolvedValue({
      getUri: jest.fn().mockReturnValue('mock-uri'),
      stop: jest.fn(),
    }),
  },
}));

describe('database configuration', () => {
  const originalEnv = process.env;
  const mockExit = jest
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);
  const mockConsoleLog = jest
    .spyOn(console, 'log')
    .mockImplementation(() => {});
  const mockConsoleError = jest
    .spyOn(console, 'error')
    .mockImplementation(() => {});

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('connectDB', () => {
    it('should connect to test database when NODE_ENV is test', async () => {
      process.env.NODE_ENV = 'test';

      await connectDB();

      expect(MongoMemoryServer.create).toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith('mock-uri');
      expect(mockConsoleLog).toHaveBeenCalledWith('MongoDB Connected');
    });

    it('should connect to production database when NODE_ENV is not test', async () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGO_URI = 'mongodb://production-uri';

      await connectDB();

      expect(MongoMemoryServer.create).not.toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith('mongodb://production-uri');
      expect(mockConsoleLog).toHaveBeenCalledWith('MongoDB Connected');
    });

    it('should exit process on connection error', async () => {
      process.env.NODE_ENV = 'production';
      const mockError = new Error('Connection failed');
      (mongoose.connect as jest.Mock).mockRejectedValueOnce(mockError);

      await connectDB();

      expect(mockConsoleError).toHaveBeenCalledWith('Error: Connection failed');
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('disconnectDB', () => {
    it('should close mongoose connection', async () => {
      await disconnectDB();

      expect(mongoose.connection.close).toHaveBeenCalled();
    });

    it('should stop memory server if it exists', async () => {
      process.env.NODE_ENV = 'test';
      await connectDB(); // This creates the memory server
      await disconnectDB();

      const memoryServer = await MongoMemoryServer.create();
      expect(memoryServer.stop).toHaveBeenCalled();
    });
  });
});
