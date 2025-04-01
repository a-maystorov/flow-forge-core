import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    'Warning: OPENAI_API_KEY is not set in the environment variables'
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
