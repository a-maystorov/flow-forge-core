import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../../app';
import { connectDB, disconnectDB } from '../../config/database';
import User from '../../models/user.model';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await connectDB();
});

afterAll(async () => {
  await disconnectDB();
});

afterEach(async () => {
  await User.deleteMany({});
});

// TODO: Add more detailed tests.
describe('User Signup Endpoint', () => {
  it('should create a new user successfully', async () => {
    const res = await request(app).post('/api/users/signup').send({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'securepassword',
    });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body.username).toBe('testuser');
  });

  it('should return validation error for invalid email', async () => {
    const res = await request(app).post('/api/users/signup').send({
      username: 'testuser',
      email: 'invalidemail',
      password: 'securepassword',
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body.errors).toBeDefined();
  });

  it('should prevent creating a duplicate user', async () => {
    // Create user once
    await request(app).post('/api/users/signup').send({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'securepassword',
    });

    // Attempt to create user with the same email again
    const res = await request(app).post('/api/users/signup').send({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'securepassword',
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toBe('User already exists');
  });
});

// TODO: Add more detailed tests.
describe('User Login Endpoint', () => {
  it('should login a user successfully and return a JWT token', async () => {
    const passwordHash = await bcrypt.hash('securepassword', 10);
    const user = new User({
      username: 'testuser',
      email: 'testuser@example.com',
      passwordHash,
    });

    await user.save();

    const res = await request(app).post('/api/users/login').send({
      email: 'testuser@example.com',
      password: 'securepassword',
    });

    const isPasswordMatch = await bcrypt.compare(
      'securepassword',
      user.passwordHash
    );

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
    expect(isPasswordMatch).toEqual(true);
  });

  it('should return an error for invalid credentials', async () => {
    const res = await request(app).post('/api/users/login').send({
      email: 'wronguser@example.com',
      password: 'wrongpassword',
    });

    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toBe('Invalid credentials');
  });
});
