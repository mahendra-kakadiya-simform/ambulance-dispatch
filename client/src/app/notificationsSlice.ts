import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// The one message shown by GlobalSnackbar. A single slot (not a queue) so a failing poll
// that repeats every few seconds shows one message, not a stack of identical ones.
interface NotificationsState {
  apiError: string | null;
}

const initialState: NotificationsState = { apiError: null };

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    apiErrorRaised(state, action: PayloadAction<string>) {
      state.apiError = action.payload;
    },
    apiErrorDismissed(state) {
      state.apiError = null;
    },
  },
});

export const { apiErrorRaised, apiErrorDismissed } = notificationsSlice.actions;
export default notificationsSlice.reducer;
