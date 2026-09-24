import { Alert, Snackbar } from '@mui/material';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { apiErrorDismissed } from '../app/notificationsSlice';

export function GlobalSnackbar() {
  const dispatch = useAppDispatch();
  const message = useAppSelector((state) => state.notifications.apiError);

  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={8000}
      onClose={(_e, reason) => reason !== 'clickaway' && dispatch(apiErrorDismissed())}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert severity="error" variant="filled" onClose={() => dispatch(apiErrorDismissed())}>
        {message}
      </Alert>
    </Snackbar>
  );
}
