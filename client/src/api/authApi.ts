import type { AuthUser } from '../types';
import { baseApi } from './baseApi';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/api/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),
    me: builder.query<MeResponse, void>({
      query: () => '/api/auth/me',
      providesTags: ['User'],
    }),
  }),
});

export const { useLoginMutation, useMeQuery } = authApi;
