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

type UserModel = Model<IUser, object, IUserMethods>;

function generateGuestUsername() {
  const adjectives = ['Creative', 'Bright', 'Swift', 'Clever', 'Bold'];
  const nouns = ['Thinker', 'Maker', 'Creator', 'Builder', 'Artist'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${adj}${noun}${number}`;
}

const UserSchema: Schema<IUser, UserModel, IUserMethods> = new Schema({
  username: { type: String },
  email: { type: String, unique: true, sparse: true },
  password: { type: String },
  isGuest: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  guestExpiresAt: { type: Date },
});

UserSchema.pre('save', function (next) {
  if (this.isGuest && !this.username) {
    this.username = generateGuestUsername();
    this.guestExpiresAt = new Date(
      Date.now() + TIME_CONSTANTS.GUEST_EXPIRY_DAYS * TIME_CONSTANTS.DAYS_IN_MS
    );
  }
  next();
});

UserSchema.pre(
  'deleteOne',
  { document: true, query: false },
  async function () {
    if (this.isGuest) {
      await Board.deleteMany({ ownerId: this._id });
    }
  }
);

UserSchema.method('generateAuthToken', function generateAuthToken() {
  this.lastActive = new Date();
  this.save();

  const token = sign(
    {
      _id: this._id,
      username: this.username,
      isGuest: this.isGuest,
      exp: this.isGuest
        ? Math.floor(this.guestExpiresAt!.getTime() / 1000)
        : Math.floor(Date.now() / 1000) +
          TIME_CONSTANTS.REGULAR_TOKEN_EXPIRY_DAYS * TIME_CONSTANTS.DAYS_IN_MS,
    },
    process.env.JWT_SECRET as string
  );

  return token;
});

UserSchema.method(
  'convertToRegisteredUser',
  async function (email: string, password: string) {
    this.isGuest = false;
    this.email = email;
    this.password = password;
    this.guestExpiresAt = undefined;
    await this.save();
  }
);

UserSchema.index({ guestExpiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model<IUser, UserModel>('User', UserSchema);

export default User;
