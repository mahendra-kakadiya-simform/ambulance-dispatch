import { Role } from '../../types';

export function roleLandingPath(role: Role): string {
  switch (role) {
    case Role.SUPER_ADMIN:
      return '/admin/users';
    case Role.DISPATCHER:
      return '/dispatch/requests';
    case Role.DRIVER:
      return '/driver';
  }
}
