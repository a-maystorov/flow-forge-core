import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import User from '../../../models/user.model';

describe('/api/auth', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  describe('POST /login', () => {
    let user: InstanceType<typeof User>;
    let email: string;
    let password: string;

    const exe = () => {
      return request(app).post('/api/auth/login').send({ email, password });
    };

    beforeEach(async () => {
      email = 'dev.test@gmail.com';
      password = '12345678';

      user = new User({ username: 'name1', email, password });

      const salt = await bcrypt.genSalt(10);

      if (user.password) {
        user.password = await bcrypt.hash(user.password, salt);
      }

      await user.save();
    });

    afterEach(async () => {
      await User.deleteMany({});
    });

    it('should return 400 if email is not provided', async () => {
      email = '';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is not provided', async () => {
      password = '';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if email is invalid', async () => {
      email = 'invalid_email';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is invalid', async () => {
      password = 'invalid_password';

      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 200 if we have a valid request', async () => {
      const res = await exe();

      expect(res.status).toBe(200);
    });

    it('should return true if the hashed and user password are the same', async () => {
      const validPassword = '12345678';

      const auth = await bcrypt.compare(validPassword, user.password!);

      expect(auth).toEqual(true);
    });

    it('should return false if the hashed and user password are not the same', async () => {
      const invalidPassword = 'invalid_password';

      const auth = await bcrypt.compare(invalidPassword, user.password!);

      expect(auth).toEqual(false);
    });
  });
});
