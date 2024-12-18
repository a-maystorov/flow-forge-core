import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { auth } from '../../../middleware';
import User from '../../../models/user.model';

describe('auth middleware', () => {
  it('should match req.userId to the user ID from a valid JWT', () => {
    const user = {
      _id: new mongoose.Types.ObjectId().toHexString(),
    };

    const token = new User(user).generateAuthToken();

    const req = {
      header: jest.fn().mockReturnValue(token),
    } as unknown as Request;
    const res = {} as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);

    expect(req.userId).toBe(user._id);
    expect(next).toHaveBeenCalled();
  });
});
