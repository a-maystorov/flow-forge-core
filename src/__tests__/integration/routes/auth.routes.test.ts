import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';
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
  });

  describe('POST /register', () => {
    let email: string;
    let password: string;
    let username: string;

    const exe = () => {
      return request(app)
        .post('/api/auth/register')
        .send({ email, password, username });
    };

    beforeEach(async () => {
      email = 'newuser@example.com';
      password = 'password123';
      username = 'newuser';
      await User.deleteMany({});
    });

    afterEach(async () => {
      await User.deleteMany({});
    });

    it('should register a new user', async () => {
      const res = await exe();

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty(
        'message',
        'User registered successfully'
      );

      // Verify user created in database
      const user = await User.findOne({ email });
      expect(user).not.toBeNull();
      expect(user?.email).toBe(email);
      expect(user?.username).toBe(username);
    });

    it('should return 400 if email already exists', async () => {
      // Create existing user first
      await User.create({
        email,
        password: 'existing123',
        username: 'existinguser',
      });

      const res = await exe();

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email already in use');
    });

    it('should return 400 if email is invalid', async () => {
      email = 'invalid-email';
      const res = await exe();

      expect(res.status).toBe(400);
    });

    it('should return 400 if password is too short', async () => {
      password = '123';
      const res = await exe();

      expect(res.status).toBe(400);
    });
  });

  describe('POST /temp-session', () => {
    let expiredUser: InstanceType<typeof User>;
    let expiredUserBoard: InstanceType<typeof Board>;
    let existingTempUser: InstanceType<typeof User>;
    let existingTempUserBoard: InstanceType<typeof Board>;

    beforeEach(async () => {
      // Create an expired user
      const expiredDate = new Date();
      expiredDate.setDate(expiredDate.getDate() - 1); // 1 day in the past

      expiredUser = new User({
        expiresAt: expiredDate,
      });
      await expiredUser.save();

      // Create a board for the expired user
      expiredUserBoard = new Board({
        name: 'Expired User Board',
        ownerId: expiredUser._id,
      });
      await expiredUserBoard.save();

      // Create a valid temporary user
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5); // 5 days in the future

      existingTempUser = new User({
        expiresAt: futureDate,
      });
      await existingTempUser.save();

      // Create a board for the valid temporary user
      existingTempUserBoard = new Board({
        name: 'Existing Temp User Board',
        ownerId: existingTempUser._id,
      });
      await existingTempUserBoard.save();
    });

    afterEach(async () => {
      await User.deleteMany({});
      await Board.deleteMany({});
    });

    it('should create a new temporary user when no tempUserId is provided', async () => {
      const res = await request(app).post('/api/auth/temp-session').send({});

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.message).toContain('Temporary session created');

      // The expiration date should be in the future
      const expiresAt = new Date(res.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Verify cleanup function removed expired users
      const expiredUserExists = await User.findById(expiredUser._id);
      expect(expiredUserExists).toBeNull();

      // Verify expired user's board was cleaned up
      const expiredBoardExists = await Board.findById(expiredUserBoard._id);
      expect(expiredBoardExists).toBeNull();

      // Verify existing temp user still exists
      const existingUserStillExists = await User.findById(existingTempUser._id);
      expect(existingUserStillExists).not.toBeNull();

      // Verify we now have 2 temp users (the existing one and the new one)
      const tempUsers = await User.find({ expiresAt: { $exists: true } });
      expect(tempUsers).toHaveLength(2);
    });

    it('should reuse an existing temporary user when valid tempUserId is provided', async () => {
      const res = await request(app)
        .post('/api/auth/temp-session')
        .send({ tempUserId: existingTempUser._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('userId');
      expect(res.body.userId).toBe(existingTempUser._id.toString());
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.message).toContain('Resumed temporary session');

      // Verify no new temp users were created
      const tempUsers = await User.find({ expiresAt: { $exists: true } });
      expect(tempUsers).toHaveLength(1); // only the existing one, expired one was cleaned up

      // Verify the existing board is still associated with the user
      const existingBoard = await Board.findById(existingTempUserBoard._id);
      expect(existingBoard).not.toBeNull();
    });

    it('should create a new temporary user when an invalid tempUserId is provided', async () => {
      const res = await request(app)
        .post('/api/auth/temp-session')
        .send({ tempUserId: 'invalid-id' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('userId');
      // Can't compare IDs directly since a new one is generated
      expect(res.body.userId).not.toBe('invalid-id');
      expect(res.body).toHaveProperty('expiresAt');
      expect(res.body.message).toContain('Temporary session created');

      // Verify a new temp user was created
      const tempUsers = await User.find({ expiresAt: { $exists: true } });
      expect(tempUsers).toHaveLength(2); // the existing one and a new one
    });

    it('should create a new temporary user when the provided tempUserId is expired', async () => {
      const res = await request(app)
        .post('/api/auth/temp-session')
        .send({ tempUserId: expiredUser._id.toString() });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.message).toContain('Temporary session created');

      // The expired user should be deleted by the cleanup process
      const expiredUserExists = await User.findById(expiredUser._id);
      expect(expiredUserExists).toBeNull();

      // Verify a new temp user was created
      const tempUsers = await User.find({ expiresAt: { $exists: true } });
      expect(tempUsers).toHaveLength(2); // the existing one and a new one
    });
  });

  describe('POST /convert-temp-account', () => {
    let tempUser: InstanceType<typeof User>;
    let tempUserBoard: InstanceType<typeof Board>;
    let token: string;
    let email: string;
    let password: string;
    let username: string;

    beforeEach(async () => {
      // Create a temporary user
      tempUser = new User({
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await tempUser.save();
      token = tempUser.generateAuthToken();

      // Create a board for the temporary user
      tempUserBoard = new Board({
        name: 'Temp User Board',
        ownerId: tempUser._id,
      });
      await tempUserBoard.save();

      // Setup conversion data
      email = 'converted@example.com';
      password = 'password123';
      username = 'converteduser';
    });

    afterEach(async () => {
      await User.deleteMany({});
      await Board.deleteMany({});
    });

    const execConvertAccount = () => {
      return request(app)
        .post('/api/auth/convert-temp-account')
        .set('x-auth-token', token)
        .send({ email, password, username });
    };

    it('should return 401 if no token provided', async () => {
      token = '';
      const res = await execConvertAccount();

      expect(res.status).toBe(401);
    });

    it('should convert a temporary user to a permanent account', async () => {
      const res = await execConvertAccount();

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty(
        'message',
        'Account successfully converted to a permanent account'
      );

      // Verify the user was updated correctly
      const updatedUser = await User.findById(tempUser._id);
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.email).toBe(email);
      expect(updatedUser?.username).toBe(username);
      expect(updatedUser?.expiresAt).toBeUndefined();

      // Verify the board still exists and is associated with the user
      const board = await Board.findById(tempUserBoard._id);
      expect(board).not.toBeNull();
      expect(board?.ownerId.toString()).toBe(tempUser._id.toString());

      // Verify the JWT payload in the response token
      const decodedToken = jwt.verify(
        res.body.token,
        process.env.JWT_SECRET as string
      ) as JwtPayload;
      expect(decodedToken).toHaveProperty('_id');
      expect(decodedToken).toHaveProperty('email', email);
      expect(decodedToken).toHaveProperty('username', username);
      expect(decodedToken).toHaveProperty('isTemporary', false);
    });

    it('should return 400 if user already has an email', async () => {
      // Override the temp user with one that already has an email
      tempUser = new User({
        email: 'existing@example.com',
        password: 'password123',
      });
      await tempUser.save();
      token = tempUser.generateAuthToken();

      // Use different email/username for the request
      email = 'new@example.com';
      username = 'newusername';

      const res = await execConvertAccount();

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('This account is already registered');
    });

    it('should return 400 if email is already in use', async () => {
      // Create another user with the same email we want to use for conversion
      await User.create({
        email,
        password: 'existing123',
        username: 'existinguser',
      });

      const res = await execConvertAccount();

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email already in use');
    });
  });
});
