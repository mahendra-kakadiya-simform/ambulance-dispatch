import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../config/db.js';
import type { Role } from '../generated/prisma/enums.js';
import { UnauthenticatedError } from '../utils/errors.js';

// Deliberately the same message and error type whether the email doesn't exist,
// the account is deactivated, or the password is wrong — see login() below.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface LoginResult {
  token: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user?.isActive) {
    throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
  }

  const signOptions: jwt.SignOptions = {
    // JWT_EXPIRES_IN is a free-form validated string (e.g. "1h"); jsonwebtoken's types
    // want the narrower `ms` string-literal union, so this cast is the honest escape hatch.
    expiresIn: config.JWT_EXPIRES_IN as NonNullable<jwt.SignOptions['expiresIn']>,
  };
  const token = jwt.sign({ userId: user.id, role: user.role }, config.JWT_SECRET, signOptions);

  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.isActive) {
    throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
