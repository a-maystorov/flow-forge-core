import jwt from 'jsonwebtoken';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import User from '../../../models/user.model';

interface JWTPayload {
  _id: string;
  isGuest: boolean;
  exp?: number;
  iat?: number;
}

describe('User Model', () => {
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
    it('should generate valid JWT for regular user', async () => {
      const user = new User({
        email: 'test@example.com',
        password: 'password123',
        isGuest: false,
      });
      await user.save();

      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JWTPayload;

      expect(decoded._id).toBe(user._id.toString());
      expect(decoded.isGuest).toBe(false);
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it('should generate valid JWT for guest user with longer expiration', async () => {
      const user = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await user.save();

      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as JWTPayload;

      expect(decoded._id).toBe(user._id.toString());
      expect(decoded.isGuest).toBe(true);
      expect(decoded.exp).toBeDefined();
      // Guest token should expire in ~7 days
      expect(decoded.exp! - decoded.iat!).toBeCloseTo(7 * 24 * 60 * 60, -2);
    });
  });

  describe('convertToRegisteredUser', () => {
    it('should convert guest user to registered user', async () => {
      const guestUser = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await guestUser.save();

      const email = 'converted@example.com';
      const password = 'newpassword123';

      await guestUser.convertToRegisteredUser(email, password);
      await guestUser.save();

      const updatedUser = await User.findById(guestUser._id);
      expect(updatedUser).toBeDefined();
      expect(updatedUser?.isGuest).toBe(false);
      expect(updatedUser?.email).toBe(email);
      expect(updatedUser?.password).toBe(password);
      expect(updatedUser?.guestExpiresAt).toBeUndefined();
    });
  });

  describe('cleanupExpiredGuests', () => {
    it('should delete expired guest users and their boards', async () => {
      const expiredGuest = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      });
      await expiredGuest.save();

      const board = new Board({
        name: 'Test Board',
        ownerId: expiredGuest._id,
      });
      await board.save();

      const activeGuest = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      });
      await activeGuest.save();

      await User.cleanupExpiredGuests();

      const expiredGuestExists = await User.findById(expiredGuest._id);
      const expiredGuestBoard = await Board.findById(board._id);
      const activeGuestExists = await User.findById(activeGuest._id);

      expect(expiredGuestExists).toBeNull();
      expect(expiredGuestBoard).toBeNull();
      expect(activeGuestExists).toBeDefined();
    });
  });
});
