import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Flow Forge Core!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
