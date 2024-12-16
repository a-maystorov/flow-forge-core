import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../../config/database';
import User from '../../../models/user.model';
import Board from '../../../models/board.model';

interface JWTPayload {
  _id: string;
  username?: string;
  isGuest: boolean;
  exp?: number;
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
    it('should return a valid JWT for regular user', async () => {
      const payload = {
        _id: new mongoose.Types.ObjectId().toHexString(),
        isGuest: false,
      };

      const user = new User(payload);
      await user.save();
      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        `${process.env.JWT_SECRET}`
      ) as JWTPayload;

      expect(decoded._id).toBe(payload._id);
      expect(decoded.isGuest).toBe(false);
      expect(decoded.exp).toBeDefined();
    });

    it('should return a valid JWT for guest user', async () => {
      const payload = {
        _id: new mongoose.Types.ObjectId().toHexString(),
        isGuest: true,
      };

      const user = new User(payload);
      await user.save();
      const token = user.generateAuthToken();
      const decoded = jwt.verify(
        token,
        `${process.env.JWT_SECRET}`
      ) as JWTPayload;

      expect(decoded._id).toBe(payload._id);
      expect(decoded.isGuest).toBe(true);
      expect(decoded.exp).toBeDefined();
    });
  });

  describe('pre-save hook', () => {
    it('should set guestExpiresAt for guest users', async () => {
      const user = new User({ isGuest: true });
      await user.save();

      expect(user.guestExpiresAt).toBeDefined();
      expect(user.guestExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate username for guest users', async () => {
      const user = new User({ isGuest: true });
      await user.save();

      expect(user.username).toBeDefined();
      // Username format should be [Adjective][Noun][Number]
      // where number is between 100-999
      expect(user.username).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+[1-9]\d{2}$/);
    });

    it('should not set guestExpiresAt for regular users', async () => {
      const user = new User({
        username: 'test',
        email: 'test@test.com',
        password: 'password123',
      });
      await user.save();

      expect(user.guestExpiresAt).toBeUndefined();
    });
  });

  describe('convertToRegisteredUser', () => {
    it('should convert guest user to regular user', async () => {
      const user = new User({ isGuest: true });
      await user.save();

      const email = 'test@test.com';
      const password = 'hashedPassword123';

      await user.convertToRegisteredUser(email, password);

      expect(user.isGuest).toBe(false);
      expect(user.email).toBe(email);
      expect(user.password).toBe(password);
      expect(user.guestExpiresAt).toBeUndefined();
    });
  });

  describe('guest user TTL', () => {
    it('should handle TTL-based deletion of guest users', async () => {
      const user = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() - 1000), // Set to 1 second in the past
      });
      await user.save();

      const board = new Board({
        name: 'Test Board',
        ownerId: user._id,
      });
      await board.save();

      let foundUser = await User.findById(user._id);
      let foundBoard = await Board.findById(board._id);
      expect(foundUser).not.toBeNull();
      expect(foundBoard).not.toBeNull();

      // Simulate TTL monitor deletion
      await User.deleteOne({ _id: user._id });

      foundUser = await User.findById(user._id);
      foundBoard = await Board.findById(board._id);
      expect(foundUser).toBeNull();
      // Board remains since TTL monitor uses query middleware
      expect(foundBoard).not.toBeNull();

      // Cleanup
      await Board.deleteOne({ _id: board._id });
    });
  });
});
