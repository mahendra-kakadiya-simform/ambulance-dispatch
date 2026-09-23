import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../../types';

const STORAGE_KEY = 'ambulanceDispatch.auth';

interface StoredAuth {
  token: string;
  user: AuthUser;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: 'authenticated' | 'unauthenticated';
}

function loadStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredAuth>;
    if (!parsed.token || !parsed.user) {
      return null;
    }
    return { token: parsed.token, user: parsed.user };
  } catch {
    return null;
  }
}

const stored = loadStoredAuth();

const initialState: AuthState = {
  token: stored?.token ?? null,
  user: stored?.user ?? null,
  status: stored ? 'authenticated' : 'unauthenticated',
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    credentialsSet: (state, action: PayloadAction<StoredAuth>) => {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.status = 'authenticated';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(action.payload));
    },
    loggedOut: (state) => {
      state.token = null;
      state.user = null;
      state.status = 'unauthenticated';
      localStorage.removeItem(STORAGE_KEY);
    },
  },
});

export const { credentialsSet, loggedOut } = authSlice.actions;
export default authSlice.reducer;
