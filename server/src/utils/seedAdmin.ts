import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { prisma } from '../config/db.js';
import { logger } from './logger.js';

const SALT_ROUNDS = 12;

export async function ensureSuperAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: config.SUPER_ADMIN_EMAIL },
  });

  if (existing) {
    logger.info('super admin already exists');
    return;
  }

  const passwordHash = await bcrypt.hash(config.SUPER_ADMIN_PASSWORD, SALT_ROUNDS);

  await prisma.user.create({
    data: {
      email: config.SUPER_ADMIN_EMAIL,
      passwordHash,
      name: config.SUPER_ADMIN_NAME,
      role: 'SUPER_ADMIN',
    },
  });

  logger.info('super admin created');
}
