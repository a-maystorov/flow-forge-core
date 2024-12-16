import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import User from '../../../models/user.model';

describe('auth middleware', () => {
  let token: string;

  const exe = () => {
    return request(app)
      .get('/api/boards') // Using GET instead of POST to test pure auth
      .set('x-auth-token', token);
  };

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(() => {
    token = new User().generateAuthToken();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('token validation', () => {
    it('should return 400 if token is invalid', async () => {
      token = 'invalid-token';
      const res = await exe();
      expect(res.status).toBe(400);
    });

    it('should create a guest user if no token is provided', async () => {
      token = '';
      const res = await exe();

      const guestUser = await User.findOne({ isGuest: true });
      const newToken = res.header['x-auth-token'];

      expect(res.status).toBe(200);
      expect(guestUser).not.toBeNull();
      expect(newToken).toBeDefined();
      expect(guestUser!.guestExpiresAt).toBeDefined();
    });

    it('should accept valid token from regular user', async () => {
      const user = new User({
        username: 'test',
        email: 'test@test.com',
        password: 'password123',
      });
      await user.save();
      token = user.generateAuthToken();

      const res = await exe();
      expect(res.status).toBe(200);
    });

    it('should accept valid token from guest user', async () => {
      const user = new User({ isGuest: true });
      await user.save();
      token = user.generateAuthToken();

      const res = await exe();
      expect(res.status).toBe(200);
    });
  });
});
