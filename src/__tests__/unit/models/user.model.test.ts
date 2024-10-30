import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../../models/user.model';

describe('user.generateAuthToken', () => {
  it('should return a valid JWT', () => {
    const payload = {
      _id: new mongoose.Types.ObjectId().toHexString(),
    };

    const user = new User(payload);
    const token = user.generateAuthToken();
    const decoded = jwt.verify(token, `${process.env.JWT_SECRET}`);

    expect(decoded).toMatchObject(payload);
  });
});
