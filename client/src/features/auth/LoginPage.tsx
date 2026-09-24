import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
} from '@mui/material';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractApiError } from '../../api/errorUtils';
import { useLoginMutation } from '../../api/authApi';
import { baseApi } from '../../api/baseApi';
import { useAppDispatch } from '../../app/hooks';
import { credentialsSet } from './authSlice';
import { roleLandingPath } from './roleLandingPath';

interface FieldErrors {
  email?: string;
  password?: string;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [login, { isLoading }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = 'Email is required';
    }
    if (!password) {
      errors.password = 'Password is required';
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
      const result = await login({ email, password }).unwrap();
      // RTK Query's cache lives in the Redux store and survives logout/login (no page
      // reload), so without this the new user would see the previous user's cached data
      // (saved location, current job, lists). It must run here, before navigating: the
      // login page has no cached-data hooks mounted, and hooks that are mounted when the
      // cache is reset can get stuck loading.
      dispatch(baseApi.util.resetApiState());
      dispatch(credentialsSet(result));
      navigate(roleLandingPath(result.user.role), { replace: true });
    } catch (err) {
      setFormError(extractApiError(err).message);
    }
  }

  return (
    <Container maxWidth="xs" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Card sx={{ width: '100%' }}>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Ambulance Dispatch
          </Typography>

          <Box component="form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}

            <TextField
              label="Email"
              type="email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={Boolean(fieldErrors.email)}
              helperText={fieldErrors.email}
              disabled={isLoading}
              autoComplete="email"
            />

            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password}
              disabled={isLoading}
              autoComplete="current-password"
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              loading={isLoading}
              sx={{ mt: 3 }}
            >
              Sign in
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
