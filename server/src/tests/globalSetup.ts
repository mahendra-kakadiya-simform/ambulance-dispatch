import { execSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from './testDatabase.js';

// Runs once before the whole suite: creates the test database if it does not exist yet,
// then applies every migration (including the hand-written partial unique index).
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }

  execSync('npx prisma migrate deploy --config prisma7.config.ts', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
