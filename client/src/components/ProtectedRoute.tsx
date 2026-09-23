import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet } from 'react-router-dom';
import { useMeQuery } from '../api/authApi';
import { useAppSelector } from '../app/hooks';

export function ProtectedRoute() {
  const token = useAppSelector((state) => state.auth.token);
  // A token in localStorage only means we *were* logged in — it says nothing about
  // whether the server still considers it valid. Revalidate against /me on load so
  // an expired/invalid/corrupted token gets caught immediately (the 401 handler in
  // baseApi.ts then logs out and redirects) instead of only on the next API call.
  const { isLoading } = useMeQuery(undefined, { skip: !token });

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return <Outlet />;
}
