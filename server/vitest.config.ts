import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './src/tests/testDatabase.js';

export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    // Creates and migrates the dedicated test database once per run.
    globalSetup: ['./src/tests/globalSetup.ts'],
    // Integration tests share one database, so test files run one at a time.
    fileParallelism: false,
    // Applied before any test file imports src/config/env.ts; dotenv never overrides
    // variables that are already set, so the app under test talks to the test database.
    env: {
      DATABASE_URL: testDatabaseUrl(),
      NODE_ENV: 'test',
    },
  },
});
