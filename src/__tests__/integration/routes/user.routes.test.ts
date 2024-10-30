import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import User from '../../../models/user.model';

describe('/api/users', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('POST /signup', () => {
    let username: string;
    let email: string;
    let password: string;

    const exe = async () => {
      return request(app)
        .post('/api/users/signup')
        .send({ username, email, password });
    };

    beforeEach(() => {
      username = 'user1';
      email = 'dev.test@gmail.com';
      password = '12345678';
    });

    afterEach(async () => {
      await User.deleteMany({});
    });

    it('should return 400 if username is not provided', async () => {
      username = '';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if username is less than 3 characters', async () => {
      username = 'ab';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if email is not provided', async () => {
      email = '';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if email is invalid', async () => {
      email = 'invalid_email';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is not provided', async () => {
      password = '';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is less than 8 characters', async () => {
      password = '1234567';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if email is already in use', async () => {
      await User.collection.insertOne({
        username: 'user1',
        email: 'dev.test@gmail.com',
        password: '12345678',
      });

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 201 if we have a valid request', async () => {
      const res = await exe();

      expect(res.status).toBe(201);
    });

    it('should return the user if we have a valid request', async () => {
      const res = await exe();

      expect(res.body).toHaveProperty('_id');
      expect(res.body).toHaveProperty('username', 'user1');
      expect(res.body).toHaveProperty('email', 'dev.test@gmail.com');
    });
  });
});
