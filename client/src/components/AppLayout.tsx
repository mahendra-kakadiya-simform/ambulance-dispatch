import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { loggedOut } from '../features/auth/authSlice';
import { Role } from '../types';

const DRAWER_WIDTH = 220;

interface NavItem {
  label: string;
  path: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Users', path: '/admin/users', roles: [Role.SUPER_ADMIN] },
  { label: 'Vehicles', path: '/admin/vehicles', roles: [Role.SUPER_ADMIN] },
  { label: 'Requests', path: '/dispatch/requests', roles: [Role.DISPATCHER] },
  { label: 'Live positions', path: '/dispatch/positions', roles: [Role.DISPATCHER, Role.SUPER_ADMIN] },
  { label: 'My Route', path: '/driver', roles: [Role.DRIVER] },
];

export function AppLayout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector((state) => state.auth.user);

  const visibleItems = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  function handleLogout() {
    dispatch(loggedOut());
    navigate('/login', { replace: true });
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Ambulance Dispatch
          </Typography>
          {user && (
            <Typography variant="body2">
              {user.name} · {user.role}
            </Typography>
          )}
          <Button color="inherit" onClick={handleLogout}>
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {visibleItems.map((item) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path}
                onClick={() => navigate(item.path)}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            ))}
          </List>
          <Divider />
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
