import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

dotenv.config();

let memoryServer: MongoMemoryServer;

const connectDB = async () => {
  try {
    if (process.env.NODE_ENV === 'test') {
      memoryServer = await MongoMemoryServer.create();
      const uri = memoryServer.getUri();
      await mongoose.connect(uri);
    } else {
      const db = process.env.MONGO_URI as string;
      await mongoose.connect(db);
    }
    console.log('MongoDB Connected');
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1); // Exit process with failure
  }
};

const disconnectDB = async () => {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
  }
};

export { connectDB, disconnectDB };
