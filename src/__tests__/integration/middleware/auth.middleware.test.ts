import request from 'supertest';
import app from '../../../app';
import { connectDB, disconnectDB } from '../../../config/database';
import Board from '../../../models/board.model';
import User from '../../../models/user.model';

describe('auth middleware', () => {
  let token: string;

  const exe = () => {
    return request(app)
      .post('/api/boards')
      .set('x-auth-token', token)
      .send({ name: 'board1' });
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
    await Board.deleteMany({});
    await User.deleteMany({});
  });

  it('should return 400 if token is invalid', async () => {
    token = 'invalid-token';

    const res = await exe();

    expect(res.status).toBe(400);
  });

  it('should create a guest user if no token is provided', async () => {
    token = '';

    const res = await exe();

    const guestUser = await User.findOne({ isGuest: true });
    const guestToken = res.header['x-guest-token'];

    expect(res.status).toBe(201);
    expect(guestUser).not.toBeNull();
    expect(guestUser?.username).toMatch(/^Guest\d+$/);
    expect(guestToken).toBeDefined();
    expect(typeof guestToken).toBe('string');
  });
});
