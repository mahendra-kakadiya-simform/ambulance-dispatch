import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppSelector } from './app/hooks';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleRoute } from './components/RoleRoute';
import { UsersPage } from './features/admin/UsersPage';
import { VehiclesPage } from './features/admin/VehiclesPage';
import { LoginPage } from './features/auth/LoginPage';
import { roleLandingPath } from './features/auth/roleLandingPath';
import { DriverPage } from './features/driver/DriverPage';
import { LivePositionsPage } from './features/dispatcher/LivePositionsPage';
import { RequestsPage } from './features/dispatcher/RequestsPage';
import { Role } from './types';

function RootRedirect() {
  const role = useAppSelector((state) => state.auth.user?.role);
  return <Navigate to={role ? roleLandingPath(role) : '/login'} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RootRedirect />} />

          <Route element={<RoleRoute allow={[Role.SUPER_ADMIN]} />}>
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/vehicles" element={<VehiclesPage />} />
          </Route>

          <Route element={<RoleRoute allow={[Role.DISPATCHER]} />}>
            <Route path="/dispatch/requests" element={<RequestsPage />} />
          </Route>

          <Route element={<RoleRoute allow={[Role.DISPATCHER, Role.SUPER_ADMIN]} />}>
            <Route path="/dispatch/positions" element={<LivePositionsPage />} />
          </Route>

          <Route element={<RoleRoute allow={[Role.DRIVER]} />}>
            <Route path="/driver" element={<DriverPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
