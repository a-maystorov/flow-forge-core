import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error(
    'No OpenAI API key found. Please set OPENAI_API_KEY environment variable.'
  );
}

const client = new OpenAI({
  apiKey,
});

const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo'; // Default model

export const openai = {
  client,
  model,
};
