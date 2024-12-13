import dotenv from 'dotenv';
import { sign } from 'jsonwebtoken';
import mongoose, { Model, Schema } from 'mongoose';

dotenv.config();

export interface IUser {
  username?: string;
  email?: string;
  password?: string;
  isGuest: boolean;
}

interface IUserMethods {
  generateAuthToken(): string;
}

type UserModel = Model<IUser, object, IUserMethods>;

function generateGuestUsername() {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `Guest${randomSuffix}`;
}

const UserSchema: Schema<IUser, UserModel, IUserMethods> = new Schema({
  username: { type: String },
  email: { type: String, unique: true, sparse: true },
  password: { type: String },
  isGuest: { type: Boolean, default: false },
});

UserSchema.pre('save', function (next) {
  if (this.isGuest && !this.username) {
    this.username = generateGuestUsername();
  }
  next();
});

UserSchema.method('generateAuthToken', function generateAuthToken() {
  const token = sign(
    {
      _id: this._id,
      username: this.username,
      isGuest: this.isGuest,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  );

  return token;
});

const User = mongoose.model<IUser, UserModel>('User', UserSchema);

export default User;
