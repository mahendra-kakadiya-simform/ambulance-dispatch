import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useCreateUserMutation, useUpdateUserMutation } from '../../api/usersApi';
import { Role, type User } from '../../types';

interface FormValues {
  name: string;
  email: string;
  role: Role;
  password: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  role?: string;
  password?: string;
}

const EMPTY_FORM: FormValues = { name: '', email: '', role: Role.DISPATCHER, password: '' };

interface UserFormDialogProps {
  open: boolean;
  user: User | null; // null = create mode, editing that user otherwise
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function UserFormDialog({ open, user, onClose, onSuccess }: UserFormDialogProps) {
  const isEditMode = user !== null;

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [updateUser, { isLoading: isUpdating }] = useUpdateUserMutation();
  const isSubmitting = isCreating || isUpdating;

  // Reset the form whenever the dialog is (re)opened, seeding it from `user` in edit mode.
  useEffect(() => {
    if (open) {
      setValues(
        user ? { name: user.name, email: user.email, role: user.role, password: '' } : EMPTY_FORM,
      );
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, user]);

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!values.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!isEditMode) {
      if (!values.email.trim()) {
        errors.email = 'Email is required';
      } else if (!/^\S+@\S+\.\S+$/.test(values.email)) {
        errors.email = 'Enter a valid email address';
      }
      if (!values.password) {
        errors.password = 'Password is required';
      } else if (values.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    try {
      if (isEditMode) {
        await updateUser({ id: user.id, name: values.name, role: values.role }).unwrap();
        onSuccess('User updated successfully');
      } else {
        await createUser({
          name: values.name,
          email: values.email,
          password: values.password,
          role: values.role,
        }).unwrap();
        onSuccess('User created successfully');
      }
      onClose();
    } catch (err) {
      // Client-side validation is a convenience — the server is the source of truth.
      // A field-level API error (e.g. duplicate email) maps back onto that field.
      const { code, message, fieldErrors: apiFieldErrors } = extractApiError(err);
      if (code === 'CONFLICT') {
        setFieldErrors((prev) => ({ ...prev, email: message }));
      } else if (Object.keys(apiFieldErrors).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...apiFieldErrors }));
      } else {
        setFormError(message);
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isEditMode ? 'Edit user' : 'Add user'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}

            <TextField
              label="Name"
              fullWidth
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
              disabled={isSubmitting}
            />

            <TextField
              label="Email"
              type="email"
              fullWidth
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email ?? (isEditMode ? 'Email cannot be changed' : undefined)}
              disabled={isSubmitting || isEditMode}
            />

            <FormControl fullWidth error={Boolean(fieldErrors.role)}>
              <InputLabel id="user-role-label">Role</InputLabel>
              <Select
                labelId="user-role-label"
                label="Role"
                value={values.role}
                onChange={(e) => setValues((v) => ({ ...v, role: e.target.value as Role }))}
                disabled={isSubmitting}
              >
                <MenuItem value={Role.SUPER_ADMIN}>Super Admin</MenuItem>
                <MenuItem value={Role.DISPATCHER}>Dispatcher</MenuItem>
                <MenuItem value={Role.DRIVER}>Driver</MenuItem>
              </Select>
            </FormControl>

            {!isEditMode && (
              <TextField
                label="Password"
                type="password"
                fullWidth
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
                error={Boolean(fieldErrors.password)}
                helperText={fieldErrors.password}
                disabled={isSubmitting}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isEditMode ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
