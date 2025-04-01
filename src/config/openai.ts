import dotenv from 'dotenv';

dotenv.config();

const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o', // Default to GPT-4o but allow override
  organization: process.env.OPENAI_ORGANIZATION || undefined,
  maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
  temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
};

export default openaiConfig;
