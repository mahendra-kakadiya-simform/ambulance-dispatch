// Integration tests run against a real Postgres database, but never the development one:
// TEST_DATABASE_URL if set, otherwise DATABASE_URL with "_test" appended to the database
// name (ambulance_dispatch -> ambulance_dispatch_test).
export function testDatabaseUrl(): string {
  if (process.env['TEST_DATABASE_URL']) {
    return process.env['TEST_DATABASE_URL'];
  }
  const devUrl = process.env['DATABASE_URL'];
  if (!devUrl) {
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) in server/.env before running tests');
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}

/** Guard for destructive test cleanup: refuse to run against anything but a *_test database. */
export function assertTestDatabase(url: string | undefined): void {
  const name = url ? new URL(url).pathname.slice(1) : '';
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to wipe data: "${name}" is not a *_test database`);
  }
}
