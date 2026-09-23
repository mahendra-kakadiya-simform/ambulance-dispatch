import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { type FormEvent, useEffect, useState } from 'react';
import { extractApiError } from '../../api/errorUtils';
import { useUpdateUserPasswordMutation } from '../../api/usersApi';
import type { User } from '../../types';

interface ChangePasswordDialogProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function ChangePasswordDialog({ open, user, onClose, onSuccess }: ChangePasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [updatePassword, { isLoading }] = useUpdateUserPasswordMutation();

  useEffect(() => {
    if (open) {
      setPassword('');
      setFieldError(null);
      setFormError(null);
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters');
      return;
    }
    setFieldError(null);

    if (!user) {
      return;
    }

    try {
      await updatePassword({ id: user.id, password }).unwrap();
      onSuccess(`Password updated for ${user.name}`);
      onClose();
    } catch (err) {
      const { message, fieldErrors } = extractApiError(err);
      setFormError(fieldErrors.password ?? message);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change password{user ? ` — ${user.name}` : ''}</DialogTitle>
      <form onSubmit={handleSubmit} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            label="New password"
            type="password"
            fullWidth
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(fieldError)}
            helperText={fieldError}
            disabled={isLoading}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
