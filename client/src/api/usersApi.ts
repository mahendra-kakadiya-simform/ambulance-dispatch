import type { Role, User } from '../types';
import { baseApi } from './baseApi';

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  role?: Role;
  isActive?: boolean;
  search?: string;
  sort?: 'createdAt' | 'name';
  order?: 'asc' | 'desc';
}

export interface ListUsersResponse {
  data: User[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export interface UpdateUserRequest {
  id: string;
  name?: string;
  role?: Role;
  isActive?: boolean;
}

export interface UpdateUserPasswordRequest {
  id: string;
  password: string;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listUsers: builder.query<ListUsersResponse, ListUsersParams | void>({
      query: (params) => ({ url: '/api/users', params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((user) => ({ type: 'User' as const, id: user.id })),
              { type: 'User' as const, id: 'LIST' },
            ]
          : [{ type: 'User' as const, id: 'LIST' }],
    }),

    createUser: builder.mutation<{ user: User }, CreateUserRequest>({
      query: (body) => ({ url: '/api/users', method: 'POST', body }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    updateUser: builder.mutation<{ user: User }, UpdateUserRequest>({
      query: ({ id, ...body }) => ({ url: `/api/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'User', id },
        { type: 'User', id: 'LIST' },
      ],
    }),

    updateUserPassword: builder.mutation<{ user: User }, UpdateUserPasswordRequest>({
      query: ({ id, password }) => ({ url: `/api/users/${id}/password`, method: 'PATCH', body: { password } }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'User', id }],
    }),
  }),
});

export const { useListUsersQuery, useCreateUserMutation, useUpdateUserMutation, useUpdateUserPasswordMutation } =
  usersApi;
