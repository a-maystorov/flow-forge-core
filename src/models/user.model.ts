import dotenv from 'dotenv';
import { sign } from 'jsonwebtoken';
import mongoose, { Model, Schema } from 'mongoose';
import Board from './board.model';

dotenv.config();

const TIME_CONSTANTS = {
  DAYS_IN_MS: 24 * 60 * 60 * 1000, // 1 day in milliseconds
  GUEST_EXPIRY_DAYS: 7,
  REGULAR_TOKEN_EXPIRY_DAYS: 1,
} as const;

export interface IUser {
  username?: string;
  email?: string;
  password?: string;
  isGuest: boolean;
  createdAt: Date;
  lastActive: Date;
  guestExpiresAt?: Date;
}

interface IUserMethods {
  generateAuthToken(): string;
  convertToRegisteredUser(email: string, password: string): Promise<void>;
}

interface UserModel extends Model<IUser, object, IUserMethods> {
  cleanupExpiredGuests(): Promise<void>;
}

const UserSchema: Schema<IUser, UserModel, IUserMethods> = new Schema({
  username: { type: String },
  email: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  password: { type: String },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  guestExpiresAt: { type: Date },
});

UserSchema.methods.generateAuthToken = function (): string {
  const expiresIn = this.isGuest
    ? TIME_CONSTANTS.GUEST_EXPIRY_DAYS * TIME_CONSTANTS.DAYS_IN_MS
    : TIME_CONSTANTS.REGULAR_TOKEN_EXPIRY_DAYS * TIME_CONSTANTS.DAYS_IN_MS;

  return sign(
    {
      _id: this._id,
      isGuest: this.isGuest,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: Math.floor(expiresIn / 1000) } // Convert to seconds for JWT
  );
};

UserSchema.methods.convertToRegisteredUser = async function (
  email: string,
  password: string
): Promise<void> {
  this.email = email;
  this.password = password;
  this.isGuest = false;
  this.guestExpiresAt = undefined;
  await this.save();
};

UserSchema.statics.cleanupExpiredGuests = async function () {
  const expiredGuests = await this.find({
    isGuest: true,
    guestExpiresAt: { $lt: new Date() },
  });

  for (const guest of expiredGuests) {
    await Board.deleteMany({ ownerId: guest._id });
    await guest.deleteOne();
  }
};

export default mongoose.model<IUser, UserModel>('User', UserSchema);
