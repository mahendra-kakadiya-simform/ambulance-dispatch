import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type MouseEvent, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useListUsersQuery, useUpdateUserMutation } from '../../api/usersApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppSelector } from '../../app/hooks';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Role, type User } from '../../types';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { UserFormDialog } from './UserFormDialog';

const ROLE_LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: 'Super Admin',
  [Role.DISPATCHER]: 'Dispatcher',
  [Role.DRIVER]: 'Driver',
};

const ROLE_COLORS: Record<Role, 'error' | 'info' | 'success'> = {
  [Role.SUPER_ADMIN]: 'error',
  [Role.DISPATCHER]: 'info',
  [Role.DRIVER]: 'success',
};

const SKELETON_ROWS = 5;
const SKELETON_COLUMNS = 6;

export function UsersPage() {
  const currentUserId = useAppSelector((state) => state.auth.user?.id);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [page, setPage] = useState(0); // MUI TablePagination is 0-indexed, the API is 1-indexed
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useListUsersQuery({
    page: page + 1,
    pageSize,
    search: debouncedSearch.trim() || undefined,
    role: roleFilter === 'ALL' ? undefined : roleFilter,
    sort: 'createdAt',
    order: 'desc',
  });

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuUser, setMenuUser] = useState<User | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTargetUser, setConfirmTargetUser] = useState<User | null>(null);

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const [updateUser] = useUpdateUserMutation();

  function openMenu(event: MouseEvent<HTMLElement>, user: User) {
    setMenuAnchor(event.currentTarget);
    setMenuUser(user);
  }

  function closeMenu() {
    setMenuAnchor(null);
    setMenuUser(null);
  }

  function handleAddUser() {
    setEditingUser(null);
    setFormOpen(true);
  }

  function handleEditUser() {
    if (menuUser) {
      setEditingUser(menuUser);
      setFormOpen(true);
    }
    closeMenu();
  }

  function handleChangePassword() {
    if (menuUser) {
      setPasswordTargetUser(menuUser);
      setPasswordDialogOpen(true);
    }
    closeMenu();
  }

  function handleToggleActive() {
    if (menuUser) {
      setConfirmTargetUser(menuUser);
      setConfirmOpen(true);
    }
    closeMenu();
  }

  async function handleConfirmToggle() {
    if (!confirmTargetUser) {
      return;
    }
    try {
      await updateUser({ id: confirmTargetUser.id, isActive: !confirmTargetUser.isActive }).unwrap();
      setSnackbarMessage(confirmTargetUser.isActive ? 'User deactivated' : 'User activated');
    } catch (err) {
      // e.g. 409 "Cannot deactivate a driver whose vehicle has an active assignment"
      setSnackbarMessage(extractApiError(err).message);
    }
    setConfirmOpen(false);
    setConfirmTargetUser(null);
  }

  function handleRoleFilterChange(event: SelectChangeEvent) {
    setRoleFilter(event.target.value as Role | 'ALL');
    setPage(0);
  }

  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const isSelfAndActive = Boolean(menuUser && menuUser.id === currentUserId && menuUser.isActive);

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Users
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Search"
          size="small"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="role-filter-label">Role</InputLabel>
          <Select labelId="role-filter-label" label="Role" value={roleFilter} onChange={handleRoleFilterChange}>
            <MenuItem value="ALL">All roles</MenuItem>
            <MenuItem value={Role.SUPER_ADMIN}>Super Admin</MenuItem>
            <MenuItem value={Role.DISPATCHER}>Dispatcher</MenuItem>
            <MenuItem value={Role.DRIVER}>Driver</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" onClick={handleAddUser}>
          Add user
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading &&
              Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: SKELETON_COLUMNS }).map((_col, colIndex) => (
                    <TableCell key={colIndex}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={SKELETON_COLUMNS}>
                  <Box sx={{ py: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">No users found.</Typography>
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              rows.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip label={ROLE_LABELS[user.role]} color={ROLE_COLORS[user.role]} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isActive ? 'Active' : 'Inactive'}
                      color={user.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={(e) => openMenu(e, user)}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(Number.parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </TableContainer>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={handleEditUser}>Edit</MenuItem>
        <MenuItem onClick={handleChangePassword}>Change password</MenuItem>
        <MenuItem onClick={handleToggleActive} disabled={isSelfAndActive}>
          {menuUser?.isActive ? 'Deactivate' : 'Activate'}
        </MenuItem>
      </Menu>

      <UserFormDialog
        open={formOpen}
        user={editingUser}
        onClose={() => setFormOpen(false)}
        onSuccess={setSnackbarMessage}
      />

      <ChangePasswordDialog
        open={passwordDialogOpen}
        user={passwordTargetUser}
        onClose={() => setPasswordDialogOpen(false)}
        onSuccess={setSnackbarMessage}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTargetUser?.isActive ? 'Deactivate user' : 'Activate user'}
        message={`Are you sure you want to ${confirmTargetUser?.isActive ? 'deactivate' : 'activate'} ${confirmTargetUser?.name}?`}
        confirmLabel={confirmTargetUser?.isActive ? 'Deactivate' : 'Activate'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmToggle}
      />

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Box>
  );
}
