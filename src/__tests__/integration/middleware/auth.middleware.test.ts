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
    process.env.NODE_ENV = 'test';
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
  });

  it('should return 401 if no token is provided', async () => {
    token = '';

    const res = await exe();

    expect(res.status).toBe(401);
  });

  it('should return 400 if token is invalid', async () => {
    token = 'a';

    const res = await exe();

    expect(res.status).toBe(400);
  });

  it('should return 201 if token is valid', async () => {
    const res = await exe();

    expect(res.status).toBe(201);
  });
});
