import dotenv from 'dotenv';
import express from 'express';
import connectDB from './config/database';

dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
