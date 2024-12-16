import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { connectDB, disconnectDB } from '../../../config/database';
import auth from '../../../middleware/auth.middleware';
import User from '../../../models/user.model';

jest.mock('../../../models/user.model');
const MockedUser = User as jest.MockedClass<typeof User>;

describe('auth middleware', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(() => {
    MockedUser.mockClear();
  });

  it('should match req.userId to the user ID from a valid JWT', async () => {
    const userId = new mongoose.Types.ObjectId().toHexString();
    const token = jwt.sign(
      { _id: userId, isGuest: false },
      process.env.JWT_SECRET as string
    );

    MockedUser.findByIdAndUpdate = jest.fn().mockResolvedValue(null);

    const req = {
      header: jest.fn().mockReturnValue(token),
      userId: undefined,
      isGuest: undefined,
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await auth(req, res, next);

    expect(req.userId).toBe(userId);
    expect(req.isGuest).toBe(false);
    expect(next).toHaveBeenCalled();
  });
});
