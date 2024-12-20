import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
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

  describe('POST /guest-session', () => {
    afterEach(async () => {
      await User.deleteMany({});
    });

    const exe = () => {
      return request(app).post('/api/auth/guest-session').send();
    };

    it('should create a new guest session', async () => {
      const res = await exe();

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('isGuest', true);
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body).toHaveProperty(
        'message',
        'Guest session created successfully'
      );

      // Verify user was created in database
      const users = await User.find({ isGuest: true });
      expect(users).toHaveLength(1);
      expect(users[0].isGuest).toBe(true);
      expect(users[0].guestExpiresAt).toBeDefined();
    });

    it('should clean up expired guest sessions when creating a new one', async () => {
      const expiredUser = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      });
      await expiredUser.save();

      const res = await exe();

      expect(res.status).toBe(201);

      // Verify expired user was cleaned up
      const expiredUserExists = await User.findById(expiredUser._id);
      expect(expiredUserExists).toBeNull();

      // Verify only the new guest user exists
      const users = await User.find({ isGuest: true });
      expect(users).toHaveLength(1);
      expect(users[0].guestExpiresAt).toBeInstanceOf(Date);
      expect(users[0].guestExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should allow multiple concurrent guest sessions', async () => {
      // Create three guest sessions
      const res1 = await exe();
      const res2 = await exe();
      const res3 = await exe();

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res3.status).toBe(201);

      // Verify all three guest users exist in database
      const guestUsers = await User.find({ isGuest: true });
      expect(guestUsers).toHaveLength(3);

      // Verify each guest user has a unique ID
      const userIds = guestUsers.map((user) => user._id.toString());
      const uniqueIds = new Set(userIds);
      expect(uniqueIds.size).toBe(3);

      // Verify each user got a different token
      const tokens = [res1.body.token, res2.body.token, res3.body.token];
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(3);
    });
  });

  describe('POST /guest-logout', () => {
    let guestUser: InstanceType<typeof User>;
    let token: string;

    beforeEach(async () => {
      guestUser = new User({
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await guestUser.save();
      token = guestUser.generateAuthToken();
    });

    afterEach(async () => {
      await User.deleteMany({});
    });

    const exe = () => {
      return request(app)
        .post('/api/auth/guest-logout')
        .set('x-auth-token', token)
        .send();
    };

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).post('/api/auth/guest-logout').send();
      expect(res.status).toBe(401);
    });

    it('should return 400 if token is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/guest-logout')
        .set('x-auth-token', 'invalid_token')
        .send();
      expect(res.status).toBe(400);
    });

    it('should return 400 if user is not a guest', async () => {
      const regularUser = new User({
        email: 'test@test.com',
        password: 'password123',
      });
      await regularUser.save();
      const regularToken = regularUser.generateAuthToken();

      const res = await request(app)
        .post('/api/auth/guest-logout')
        .set('x-auth-token', regularToken)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('This endpoint is only for guest users');
    });

    it('should successfully logout guest user and delete their data', async () => {
      const board = new Board({ name: 'Test Board', ownerId: guestUser._id });
      await board.save();

      const res = await exe();

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        'Guest session ended and data cleaned up successfully'
      );

      const userExists = await User.findById(guestUser._id);
      expect(userExists).toBeNull();

      const boardExists = await Board.findById(board._id);
      expect(boardExists).toBeNull();
    });
  });

  describe('POST /convert-to-user', () => {
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
      const existingUser = new User({
        email: 'existing@example.com',
        password: 'password123',
      });
      await existingUser.save();

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
