// Global Jest setup file
// Only mock the socket service if we're not testing the socket functionality
const testPath = (process.env.JEST_WORKER_ID && global.jasmine?.testPath) || '';
const isSocketTest = testPath.includes('socket');

if (!isSocketTest) {
  // Mock the socket service for non-socket tests
  jest.mock('./src/config/socket', () => ({
    socketService: {
      initialize: jest.fn(),
      emitToChatSession: jest.fn(),
      shutdown: jest.fn(),
      getUserSocketsInRoom: jest.fn().mockReturnValue([]),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
      setAITypingStatus: jest.fn(),
      isUserTyping: jest.fn().mockReturnValue(false),
    },
  }));
}

afterAll(() => {
  jest.clearAllTimers();
});
