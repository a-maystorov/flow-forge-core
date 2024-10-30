import dotenv from 'dotenv';
import { sign } from 'jsonwebtoken';
import mongoose, { Document, Model, Schema } from 'mongoose';

dotenv.config();

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
}

interface IUserMethods {
  generateAuthToken(): string;
}

type UserModel = Model<IUser, object, IUserMethods>;

const UserSchema: Schema = new Schema<IUser, UserModel, IUserMethods>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
});

UserSchema.method('generateAuthToken', function generateAuthToken() {
  const token = sign(
    {
      _id: this._id,
      username: this.username,
      email: this.email,
    },
    process.env.JWT_SECRET as string
  );

  return token;
});

const User = mongoose.model<IUser, UserModel>('User', UserSchema);

export default User;
