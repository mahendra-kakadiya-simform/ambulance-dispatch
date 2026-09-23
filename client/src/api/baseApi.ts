import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { loggedOut } from '../features/auth/authSlice';

// Typed inline (not imported from ../app/store) to avoid a circular import:
// store.ts needs baseApi's reducer, so baseApi can't import store's RootState.
interface AuthSliceState {
  auth: { token: string | null };
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as AuthSliceState).auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithAuthHandling: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  // Only a *previously authenticated* request going stale (expired/invalid token,
  // deactivated user) should force a logout+redirect. A fresh, unauthenticated
  // request that 401s (e.g. a wrong-password login attempt) should not — that's
  // just a normal error for the calling component (LoginPage) to display.
  const hadToken = Boolean((api.getState() as AuthSliceState).auth.token);

  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && hadToken) {
    api.dispatch(loggedOut());
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: 'baseApi',
  baseQuery: baseQueryWithAuthHandling,
  tagTypes: ['User', 'Vehicle', 'Request', 'Position'],
  endpoints: () => ({}),
});
