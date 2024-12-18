import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

    it('should return 400 if user does not exist', async () => {
      await User.deleteMany({});
      const res = await exe();

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message', 'Invalid email or password');
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

    it('should return 400 when guest user tries to login', async () => {
      await User.deleteMany({});
      const guestUser = new User({
        email: 'guest@example.com',
        password: 'password123',
        isGuest: true,
      });
      await guestUser.save();

      const res = await request(app).post('/api/auth/login').send({
        email: 'guest@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Guest users cannot log in with a password.'
      );
    });
  });

  describe('POST /api/auth/guest-session', () => {
    afterEach(async () => {
      await User.deleteMany({});
    });

    it('should create a guest user and return token', async () => {
      const res = await request(app).post('/api/auth/guest-session');

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.isGuest).toBe(true);
      expect(res.body.expiresAt).toBeDefined();

      const decoded = jwt.verify(
        res.body.token,
        process.env.JWT_SECRET as string
      ) as {
        _id: string;
        isGuest: boolean;
      };
      expect(decoded.isGuest).toBe(true);

      const user = await User.findById(decoded._id);
      expect(user).toBeDefined();
      expect(user?.isGuest).toBe(true);
    });
  });

  describe('POST /api/auth/convert-to-user', () => {
    afterEach(async () => {
      await User.deleteMany({});
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).post('/api/auth/convert-to-user').send({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Unauthorized');
    });

    it('should return 400 when regular user tries to convert', async () => {
      const user = new User({
        email: 'regular@example.com',
        password: 'password123',
        isGuest: false,
      });
      await user.save();
      const token = user.generateAuthToken();

      const res = await request(app)
        .post('/api/auth/convert-to-user')
        .set('x-auth-token', token)
        .send({
          email: 'new@example.com',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Only guest users can be converted to regular users'
      );
    });

    it('should return 400 when email already exists', async () => {
      // Create existing user with email
      const existingUser = new User({
        email: 'existing@example.com',
        password: 'password123',
      });
      await existingUser.save();

      // Create guest user
      const guestUser = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await guestUser.save();
      const token = guestUser.generateAuthToken();

      const res = await request(app)
        .post('/api/auth/convert-to-user')
        .set('x-auth-token', token)
        .send({
          email: 'existing@example.com',
          password: 'newpassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email already in use');
    });

    it('should successfully convert guest to regular user', async () => {
      const guestUser = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await guestUser.save();
      const token = guestUser.generateAuthToken();

      const newEmail = 'converted@example.com';
      const newPassword = 'newpassword123';

      const res = await request(app)
        .post('/api/auth/convert-to-user')
        .set('x-auth-token', token)
        .send({
          email: newEmail,
          password: newPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.isGuest).toBe(false);

      const updatedUser = await User.findById(guestUser._id);
      expect(updatedUser).toBeDefined();
      expect(updatedUser?.isGuest).toBe(false);
      expect(updatedUser?.email).toBe(newEmail);
      expect(updatedUser?.guestExpiresAt).toBeUndefined();
    });
  });
});
