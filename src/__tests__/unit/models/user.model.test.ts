import jwt from 'jsonwebtoken';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import User from '../../../models/user.model';

interface JWTPayload {
  _id: string;
  iat: number;
  exp: number;
}

describe('user model', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Board.deleteMany({});
  });

  describe('generateAuthToken', () => {
    it('should generate a valid JWT for regular users', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123',
      });
      await user.save();

      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JWTPayload;

      expect(decoded._id).toBe(user._id.toString());
      expect(decoded.exp).toBeDefined();
      // Regular token should expire in ~1 day
      expect(decoded.exp! - decoded.iat!).toBeCloseTo(24 * 60 * 60, -2);
    });

    it('should generate a valid JWT for temporary users with synced expiry', async () => {
      // Create a user that expires in 7 days
      const user = new User({
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await user.save();

      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JWTPayload;

      expect(decoded._id).toBe(user._id.toString());
      expect(decoded.exp).toBeDefined();
      // Token should expire in ~7 days (synced with user expiration)
      expect(decoded.exp! - decoded.iat!).toBeCloseTo(7 * 24 * 60 * 60, -2);
    });
  });

  describe('cleanupExpiredUsers', () => {
    it('should delete expired temporary users and their boards', async () => {
      const expiredUser = new User({
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      });
      await expiredUser.save();

      const board = new Board({
        name: 'Test Board',
        ownerId: expiredUser._id,
      });
      await board.save();

      const activeUser = new User({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      });
      await activeUser.save();

      await User.cleanupExpiredUsers();

      const expiredUserExists = await User.findById(expiredUser._id);
      const expiredUserBoard = await Board.findById(board._id);
      const activeUserExists = await User.findById(activeUser._id);

      expect(expiredUserExists).toBeNull();
      expect(expiredUserBoard).toBeNull();
      expect(activeUserExists).toBeDefined();
    });
  });
});
