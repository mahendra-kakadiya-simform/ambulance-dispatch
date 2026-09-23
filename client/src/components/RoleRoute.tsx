import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import type { Role } from '../types';
import { NotAuthorisedPage } from './NotAuthorisedPage';

interface RoleRouteProps {
  allow: Role[];
}

export function RoleRoute({ allow }: RoleRouteProps) {
  const role = useAppSelector((state) => state.auth.user?.role);

  if (!role || !allow.includes(role)) {
    return <NotAuthorisedPage />;
  }

  return <Outlet />;
}
