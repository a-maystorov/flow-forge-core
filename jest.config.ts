import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  verbose: true,
  setupFilesAfterEnv: ['./jest.setup.js'],
  // Add longer timeout for all tests since we're dealing with socket connections
  testTimeout: 15000,
};

export default config;
