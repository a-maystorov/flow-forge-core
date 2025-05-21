import dotenv from 'dotenv';
import { sign } from 'jsonwebtoken';
import mongoose, { Model, Schema } from 'mongoose';

dotenv.config();

const TIME_CONSTANTS = {
  DAYS_IN_MS: 24 * 60 * 60 * 1000, // 1 day in milliseconds
  TOKEN_EXPIRY_DAYS: 1,
  TEMP_USER_EXPIRY_DAYS: 7, // Temporary users expire after 7 days
} as const;

export interface IUser {
  username?: string;
  email?: string;
  password?: string;
  createdAt: Date;
  lastActive: Date;
  expiresAt?: Date; // Used for temporary users
}

interface IUserMethods {
  generateAuthToken(): string;
}

interface UserModel extends Model<IUser, object, IUserMethods> {
  cleanupExpiredUsers(): Promise<void>;
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
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  expiresAt: { type: Date },
});

UserSchema.methods.generateAuthToken = function (): string {
  // If this is a temporary user, set token to expire at the same time as the user
  const expiresIn = this.expiresAt
    ? Math.max(0, this.expiresAt.getTime() - Date.now()) // Time until expiration
    : TIME_CONSTANTS.TOKEN_EXPIRY_DAYS * TIME_CONSTANTS.DAYS_IN_MS;

  return sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      isTemporary: !!this.expiresAt,
      expiresAt: this.expiresAt,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: Math.floor(expiresIn / 1000) } // Convert to seconds for JWT
  );
};

UserSchema.statics.cleanupExpiredUsers = async function (): Promise<void> {
  const expiredUsers = await this.find({
    expiresAt: { $lt: new Date() },
  });

  for (const user of expiredUsers) {
    await mongoose.model('Board').deleteMany({ ownerId: user._id });
    await user.deleteOne();
  }
};

export default mongoose.model<IUser, UserModel>('User', UserSchema);
