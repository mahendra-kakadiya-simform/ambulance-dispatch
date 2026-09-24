import { createListenerMiddleware, isRejectedWithValue } from '@reduxjs/toolkit';
import { extractApiError } from '../api/errorUtils';
import { apiErrorRaised } from './notificationsSlice';

// Surfaces failed *queries* (list loads, polls, lookups inside dialogs) in the global
// snackbar. Those would otherwise fail silently once a page already has data on screen.
// Mutations are not reported here: every mutation's caller already shows its own error
// inline (field errors, 409 messages), and reporting them twice would be noise.
export const apiErrorListener = createListenerMiddleware();

apiErrorListener.startListening({
  predicate: (action) => isRejectedWithValue(action),
  effect: (action, api) => {
    const meta = (action as { meta?: { arg?: { type?: string } } }).meta;
    if (meta?.arg?.type !== 'query') {
      return;
    }
    const payload = (action as { payload?: { status?: unknown } }).payload;
    // 401s are already handled by baseApi (logout + redirect to /login).
    if (payload?.status === 401) {
      return;
    }
    const message =
      payload?.status === 'FETCH_ERROR'
        ? 'Cannot reach the server. Retrying automatically…'
        : extractApiError({ data: (payload as { data?: unknown } | undefined)?.data }).message;
    api.dispatch(apiErrorRaised(message));
  },
});
