import cors, { CorsOptions } from 'cors';

const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  exposedHeaders: ['x-auth-token'],
};

export default cors(corsOptions);
