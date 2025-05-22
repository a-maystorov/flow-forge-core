import cors, { CorsOptions } from 'cors';

// Get allowed origins from environment variable or default to localhost
const corsOriginEnv = process.env.CORS_ORIGIN || '';
const allowedOrigins = corsOriginEnv
  ? corsOriginEnv.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['x-auth-token'],
};

export default cors(corsOptions);
