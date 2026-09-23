import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { ensureSuperAdmin } from './utils/seedAdmin.js';

async function main(): Promise<void> {
  try {
    await ensureSuperAdmin();
  } catch (err) {
    logger.error('Failed to ensure super admin exists', err);
    process.exit(1);
  }

  const app = createApp();

  app.listen(config.PORT, () => {
    logger.info(`Server listening on port ${config.PORT} (${config.NODE_ENV})`);
  });
}

main();
